import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { getPrice } from "../services/pricing.js";
import {
  hasValidReceipt,
  issueReceipt,
  parseReceiptHeader,
  verifyReceipt,
} from "../services/receipt.js";
import type { ReceiptSettlementFields } from "../services/receipt.js";
import { recordPayment } from "../services/ledger.js";
import { issueQuote, verifyQuote, consumeQuote } from "../services/quote.js";
import {
  depositUsdcToVaultFromSmartWallet,
  getSmartWalletAddress,
  getWalletBalance,
} from "../services/wallet.js";
import { env } from "../config/env.js";
import { pool } from "../services/db.js";
import { EVM_TX_HASH_REGEX_SOURCE, isEvmTransactionHash } from "../utils/tx.js";

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
 * 3. 유료 → 스마트 지갑 잔고 확인 → vault deposit → receipt 발급
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
        req.accessContext = {
          accessType: "receipt",
          receiptId: parsed.receiptId,
        };
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
    req.accessContext = {
      accessType: "receipt",
      receiptId: existingReceipt.receiptId,
      paymentTxHash: existingReceipt.vaultTxHash,
      vaultReceiptRef: existingReceipt.vaultReceiptRef,
    };
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
    req.accessContext = { accessType: "free", receiptId: null };
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

      // 잔고 충분 → 스마트 지갑에서 vault로 USDC 예치 + creator claimable 적립
      try {
        const vaultReceiptRef = createVaultReceiptRef({
          quoteId,
          attestationId,
          payer,
          creatorAddress: pricing.creatorAddress,
          amountUsdMicros: pricing.priceUsdMicros,
        });

        const reusableReceipt = await findReceiptByVaultRef({
          vaultReceiptRef,
          attestationId,
          payer,
          creatorAddress: pricing.creatorAddress,
          amountUsdMicros: pricing.priceUsdMicros,
        });
        if (reusableReceipt) {
          req.accessContext = {
            accessType: "paid",
            receiptId: reusableReceipt.receiptId,
            paymentTxHash: reusableReceipt.vaultTxHash,
            vaultReceiptRef,
          };
          res.setHeader(
            "X-Access-Receipt",
            `${reusableReceipt.receiptId}.${reusableReceipt.hmac}`
          );
          next();
          return;
        }

        const txHash = await depositUsdcToVaultFromSmartWallet(
          smartWalletAddress,
          attestationId,
          pricing.creatorAddress,
          pricing.priceUsdMicros,
          vaultReceiptRef
        );
        if (!isEvmTransactionHash(txHash)) {
          throw new Error(`[x402Gate] Vault deposit returned non-chain tx hash: ${txHash}`);
        }

        const settlement: ReceiptSettlementFields = {
          creatorAddress: pricing.creatorAddress,
          vaultAddress: env.VAULT_ADDRESS,
          vaultTxHash: txHash,
          vaultReceiptRef,
          claimableAmountUsdMicros: pricing.priceUsdMicros,
        };

        await processPaymentAndIssueReceipt(
          req,
          res,
          next,
          attestationId,
          payer,
          pricing.priceUsdMicros,
          "smart-wallet",
          txHash,
          settlement,
          quoteId
        );
        return;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[x402Gate] Smart wallet vault deposit failed:", errMsg);

        // vault deposit 실패는 잔고 부족이 아님 → 502로 명확히 구분
        res.status(502).json({
          error: "Payment processing failed",
          reason: "vault_deposit_failed",
          hint: "Smart wallet vault deposit failed. Check server logs for details.",
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
      payTo: env.VAULT_ADDRESS,
      vault: env.VAULT_ADDRESS,
      creator: pricing.creatorAddress,
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
  req: Request,
  res: Response,
  next: NextFunction,
  attestationId: string,
  payer: string,
  amountUsdMicros: number,
  paymentMethod: "smart-wallet",
  txHash: string,
  settlement: ReceiptSettlementFields,
  quoteId?: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Chain↔DB idempotency: vaultReceiptRef is the payment identity.
    // Do not key by tx_hash alone: ERC-4337 bundler transactions can contain multiple user ops.
    const existingPayment = await client.query(
      `SELECT receipt_id FROM payments_ledger
       WHERE vault_receipt_ref = $1
         AND attestation_id = $2
         AND payer = $3
         AND amount_usd_micros = $4
         AND creator_address = $5
         AND vault_tx_hash ~ $6
       LIMIT 1`,
      [
        settlement.vaultReceiptRef,
        attestationId,
        payer.toLowerCase(),
        amountUsdMicros,
        settlement.creatorAddress.toLowerCase(),
        EVM_TX_HASH_REGEX_SOURCE,
      ]
    );
    if (existingPayment.rows.length > 0) {
      await client.query("COMMIT");
      const existingReceipt = await client.query(
        `SELECT receipt_id, hmac, vault_tx_hash FROM access_receipts WHERE receipt_id = $1`,
        [existingPayment.rows[0].receipt_id]
      );
      if (existingReceipt.rows.length > 0) {
        const r = existingReceipt.rows[0];
        req.accessContext = {
          accessType: "paid",
          receiptId: r.receipt_id,
          paymentTxHash: r.vault_tx_hash,
          vaultReceiptRef: settlement.vaultReceiptRef,
        };
        res.setHeader("X-Access-Receipt", `${r.receipt_id}.${r.hmac}`);
        next();
        return;
      }
    }

    // P0-3: client 전달 → 동일 트랜잭션에서 실행
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90일 만료
    const receipt = await issueReceipt(
      attestationId,
      payer,
      paymentMethod,
      amountUsdMicros,
      txHash,
      expiresAt,
      client,
      settlement
    );

    await recordPayment({
      attestationId,
      payer,
      amountUsdMicros,
      paymentMethod,
      txHash,
      receiptId: receipt.receiptId,
      creatorAddress: settlement.creatorAddress,
      vaultAddress: settlement.vaultAddress,
      vaultTxHash: settlement.vaultTxHash,
      vaultReceiptRef: settlement.vaultReceiptRef,
      claimableAmountUsdMicros: settlement.claimableAmountUsdMicros,
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
    req.accessContext = {
      accessType: "paid",
      receiptId: receipt.receiptId,
      paymentTxHash: settlement.vaultTxHash,
      vaultReceiptRef: settlement.vaultReceiptRef,
    };
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

function createVaultReceiptRef(params: {
  quoteId?: string;
  attestationId: string;
  payer: string;
  creatorAddress: string;
  amountUsdMicros: number;
}): `0x${string}` {
  const seed = params.quoteId
    ? `quote:${params.quoteId}`
    : `direct:${params.attestationId}:${params.payer.toLowerCase()}:${params.creatorAddress.toLowerCase()}:${params.amountUsdMicros}`;

  return `0x${createHash("sha256").update(`proofweave:vault:${seed}`).digest("hex")}`;
}

async function findReceiptByVaultRef(params: {
  vaultReceiptRef: string;
  attestationId: string;
  payer: string;
  creatorAddress: string;
  amountUsdMicros: number;
}): Promise<{ receiptId: string; hmac: string; vaultTxHash: string } | null> {
  const result = await pool.query(
    `SELECT receipt_id, hmac, vault_tx_hash FROM access_receipts
     WHERE vault_receipt_ref = $1
       AND attestation_id = $2
       AND payer = $3
       AND creator_address = $4
       AND amount_usd_micros = $5
       AND vault_tx_hash ~ $6
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY paid_at DESC LIMIT 1`,
    [
      params.vaultReceiptRef,
      params.attestationId,
      params.payer.toLowerCase(),
      params.creatorAddress.toLowerCase(),
      params.amountUsdMicros,
      EVM_TX_HASH_REGEX_SOURCE,
    ]
  );

  if (result.rows.length === 0) return null;
  return {
    receiptId: result.rows[0].receipt_id,
    hmac: result.rows[0].hmac,
    vaultTxHash: result.rows[0].vault_tx_hash,
  };
}
