import type { Request, Response, NextFunction } from "express";
import { getPrice, toUsdcAmount } from "../services/pricing.js";
import {
  hasValidReceipt,
  issueReceipt,
  parseReceiptHeader,
  verifyReceipt,
} from "../services/receipt.js";
import { recordPayment } from "../services/ledger.js";
import { issueQuote, verifyQuote, consumeQuote } from "../services/quote.js";
import {
  getSmartWalletAddress,
  getWalletBalance,
  transferUsdcFromSmartWallet,
} from "../services/wallet.js";
import { operatorAccount } from "../config/chain.js";
import { env } from "../config/env.js";
import { pool } from "../services/db.js";

/**
 * x402 결제 게이트 미들웨어 (Phase 2-4)
 *
 * 모든 에이전트는 등록 시 CDP Smart Wallet을 보유합니다.
 * ProofWeave가 스마트 지갑에서 결제를 대행하므로,
 * 에이전트가 직접 결제 서명(X-PAYMENT)을 만들 필요가 없습니다.
 *
 * 3계층 접합점:
 * 1. X-ACCESS-RECEIPT 헤더 검증 → HMAC + DB → 바로 통과 (재조회)
 * 2. pricing_policies에서 가격 조회 → 무료면 통과
 * 3. 유료 → 스마트 지갑 잔고 확인 → 자동 USDC 전송 → receipt 발급
 *    잔고 부족 → 402 응답 (quoteId + deposit 안내)
 */
export async function x402Gate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const rawId = req.params.id;
  const attestationId: string = Array.isArray(rawId) ? rawId[0] : rawId;
  const payer: string | undefined = req.apiKeyOwner;

  if (!attestationId) {
    res.status(400).json({ error: "Attestation ID is required" });
    return;
  }

  if (!payer) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // ── Layer 1: AccessReceipt 확인 (재결제 방지) ──────────────

  // 1a. X-ACCESS-RECEIPT 헤더가 있으면 HMAC + DB 검증
  const receiptHeader = req.headers["x-access-receipt"];
  if (typeof receiptHeader === "string" && receiptHeader.length > 0) {
    const parsed = parseReceiptHeader(receiptHeader);
    if (parsed) {
      const valid = await verifyReceipt(
        parsed.receiptId,
        attestationId,
        payer,
        parsed.hmac
      );
      if (valid) {
        res.setHeader(
          "X-Access-Receipt",
          `${parsed.receiptId}.${parsed.hmac}`
        );
        next();
        return;
      }
    }
    // 헤더 검증 실패 → 서버 내부 조회로 폴백
  }

  // 1b. 서버 내부 receipt 조회 (API Key 기반)
  const existingReceipt = await hasValidReceipt(payer, attestationId);
  if (existingReceipt) {
    res.setHeader(
      "X-Access-Receipt",
      `${existingReceipt.receiptId}.${existingReceipt.hmac}`
    );
    next();
    return;
  }

  // ── Layer 2: 가격 조회 ─────────────────────────────────────
  const pricing = await getPrice(attestationId);

  if (!pricing || pricing.priceUsdMicros === 0) {
    next();
    return;
  }

  // ── Layer 3: 스마트 지갑 자동 결제 ─────────────────────────
  const smartWalletAddress = await getSmartWalletAddress(payer);

  if (smartWalletAddress) {
    const walletInfo = await getWalletBalance(smartWalletAddress);

    if (walletInfo.balanceUsdMicros >= pricing.priceUsdMicros) {
      // quoteId 검증 (있으면)
      const quoteId = typeof req.headers["x-quote-id"] === "string"
        ? req.headers["x-quote-id"]
        : undefined;

      if (quoteId) {
        const quote = await verifyQuote(quoteId, payer, attestationId);
        if (!quote) {
          res.status(400).json({ error: "Invalid quote ID" });
          return;
        }
        if (quote.consumedAt) {
          res.status(409).json({
            error: "Quote already consumed (payment already processed)",
          });
          return;
        }
        if (new Date(quote.expiresAt) < new Date()) {
          res.status(410).json({ error: "Quote expired. Request a new one." });
          return;
        }
      }

      // 잔고 충분 → 스마트 지갑에서 USDC 자동 전송
      try {
        const txHash = await transferUsdcFromSmartWallet(
          smartWalletAddress,
          operatorAccount.address,
          pricing.priceUsdMicros
        );

        await processPaymentAndIssueReceipt(
          res,
          next,
          attestationId,
          payer,
          pricing.priceUsdMicros,
          "smart-wallet",
          txHash,
          quoteId
        );
        return;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[x402Gate] Smart wallet transfer failed:", errMsg);

        // 전송 실패는 잔고 부족이 아님 → 502로 명확히 구분
        res.status(502).json({
          error: "Payment processing failed",
          reason: "transfer_failed",
          message: errMsg,
          hint: "Smart wallet USDC transfer failed. Check server logs for details.",
        });
        return;
      }
    }
  }

  // ── 잔고 부족 또는 지갑 없음 → 402 + quoteId 발급 ──────────
  const quote = await issueQuote(
    attestationId,
    payer,
    pricing.priceUsdMicros
  );

  res.status(402).json({
    "x-402": true,
    quoteId: quote.quoteId,
    expiresAt: quote.expiresAt,
    price: {
      amountUsdMicros: pricing.priceUsdMicros,
      amountUsd: (pricing.priceUsdMicros / 1_000_000).toFixed(6),
      currency: pricing.currency,
      network: pricing.network,
      payTo: operatorAccount.address,
    },
    smartWallet: smartWalletAddress
      ? {
          address: smartWalletAddress,
          message: "Insufficient balance. Send USDC to this address.",
        }
      : {
          address: null,
          message: "No smart wallet. Register via POST /auth/register first.",
        },
    description: `Payment required: ${(pricing.priceUsdMicros / 1_000_000).toFixed(6)} ${pricing.currency}`,
  });
}

// ── Receipt + Ledger 발급 (원자적 트랜잭션) ──────────────────
// P0-3: 모든 DB 호출에 동일 PoolClient 전달

async function processPaymentAndIssueReceipt(
  res: Response,
  next: NextFunction,
  attestationId: string,
  payer: string,
  amountUsdMicros: number,
  paymentMethod: "smart-wallet",
  txHash: string,
  quoteId?: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Chain↔DB idempotency: txHash가 이미 ledger에 있으면 기존 receipt 반환
    // (tx 성공 후 DB 실패 → 클라이언트 재시도 시 이중 청구 방지)
    const existingPayment = await client.query(
      `SELECT receipt_id FROM payments_ledger WHERE tx_hash = $1 LIMIT 1`,
      [txHash]
    );
    if (existingPayment.rows.length > 0) {
      await client.query("COMMIT");
      const existingReceipt = await client.query(
        `SELECT receipt_id, hmac FROM access_receipts WHERE receipt_id = $1`,
        [existingPayment.rows[0].receipt_id]
      );
      if (existingReceipt.rows.length > 0) {
        const r = existingReceipt.rows[0];
        res.setHeader("X-Access-Receipt", `${r.receipt_id}.${r.hmac}`);
        next();
        return;
      }
    }

    // P0-3: client 전달 → 동일 트랜잭션에서 실행
    const receipt = await issueReceipt(
      attestationId,
      payer,
      paymentMethod,
      amountUsdMicros,
      txHash,
      undefined, // expiresAt
      client
    );

    await recordPayment({
      attestationId,
      payer,
      amountUsdMicros,
      paymentMethod,
      txHash,
      receiptId: receipt.receiptId,
    }, client);

    // P1: consumeQuote 반환값 확인 — 이미 소비된 quote면 롤백
    if (quoteId) {
      const consumed = await consumeQuote(quoteId, client);
      if (!consumed) {
        throw new Error(`Quote ${quoteId} already consumed or expired`);
      }
    }

    await client.query("COMMIT");

    res.setHeader(
      "X-Access-Receipt",
      `${receipt.receiptId}.${receipt.hmac}`
    );
    next();
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("[x402Gate] Receipt/Ledger transaction failed:", errMessage);
    res.status(500).json({ error: "Payment processing failed" });
  } finally {
    client.release();
  }
}

