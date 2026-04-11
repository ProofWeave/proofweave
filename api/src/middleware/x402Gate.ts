import type { Request, Response, NextFunction } from "express";
import { getPrice, toUsdcAmount } from "../services/pricing.js";
import { hasValidReceipt, issueReceipt } from "../services/receipt.js";
import { recordPayment } from "../services/ledger.js";
import { operatorAccount } from "../config/chain.js";
import { env } from "../config/env.js";
import { pool } from "../services/db.js";

/**
 * x402 결제 게이트 미들웨어 (커스텀 구현)
 *
 * @x402/express의 paymentMiddleware는 정적 라우트 설정 기반이지만,
 * ProofWeave는 attestation마다 동적 가격이므로 직접 x402 프로토콜을 구현합니다.
 *
 * 3계층 접합점:
 * 1. AccessReceipt 확인 → 유효하면 바로 통과 (재결제 방지)
 * 2. pricing_policies에서 가격 조회 → 무료면 통과
 * 3. 유료 → 402 응답 (x402 표준 형식)
 *    → X-PAYMENT 헤더 있으면 Facilitator HTTP 검증
 *    → 검증 성공 → 영수증 발급 + 원장 기록
 *
 * req.params.id에서 attestationId를 추출합니다.
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
  const existingReceipt = await hasValidReceipt(payer, attestationId);
  if (existingReceipt) {
    res.setHeader("X-Access-Receipt", existingReceipt.receiptId);
    next();
    return;
  }

  // ── Layer 2: 가격 조회 ─────────────────────────────────────
  const pricing = await getPrice(attestationId);

  if (!pricing || pricing.priceUsdMicros === 0) {
    // 무료 → 바로 통과
    next();
    return;
  }

  // ── Layer 3: x402 결제 확인 ────────────────────────────────
  const paymentHeader = req.headers["x-payment"];
  const paymentValue =
    typeof paymentHeader === "string" ? paymentHeader : undefined;

  if (!paymentValue) {
    // 결제 정보 없음 → 402 응답 (x402 프로토콜)
    res.status(402).json({
      "x-402": true,
      accepts: [
        {
          scheme: "exact",
          network: pricing.network,
          amount: toUsdcAmount(pricing.priceUsdMicros),
          asset: pricing.currency,
          payTo: operatorAccount.address,
          resource: req.originalUrl,
        },
      ],
      description: `Payment required: ${(pricing.priceUsdMicros / 1_000_000).toFixed(6)} ${pricing.currency}`,
    });
    return;
  }

  // ── X-PAYMENT 검증: Facilitator HTTP 호출 ─────────────────
  let txHash: string | null = null;
  let paymentVerified = false;

  try {
    const facilitatorUrl = "https://x402.org/facilitator";
    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment: paymentValue,
        requirements: {
          scheme: "exact",
          network: pricing.network,
          amount: toUsdcAmount(pricing.priceUsdMicros),
          asset: pricing.currency,
          payTo: operatorAccount.address,
          resource: req.originalUrl,
        },
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        isValid?: boolean;
        txHash?: string;
      };
      paymentVerified = data.isValid === true;
      txHash = data.txHash ?? null;
    } else {
      console.error(
        "[x402Gate] Facilitator returned:",
        response.status,
        await response.text()
      );
    }
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("[x402Gate] Facilitator verification error:", errMessage);

    // P1: NODE_ENV 기반 분기 — 프로덕션에서는 반드시 실패 처리
    if (env.NODE_ENV === "production") {
      res.status(502).json({
        error: "Payment verification unavailable",
        message:
          "The payment facilitator is currently unreachable. Please retry.",
      });
      return;
    }

    // 개발 모드에서만 통과 (명시적 로그)
    console.warn("[x402Gate] DEV MODE: accepting unverified payment");
    paymentVerified = true;
  }

  if (!paymentVerified) {
    res.status(402).json({
      error: "Payment verification failed",
      message: "The payment signature could not be verified on-chain",
    });
    return;
  }

  // ── 결제 확인됨 → AccessReceipt + Ledger (원자적 트랜잭션) ──
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const receipt = await issueReceipt(
      attestationId,
      payer,
      "x402",
      pricing.priceUsdMicros,
      txHash ?? undefined
    );

    await recordPayment({
      attestationId,
      payer,
      amountUsdMicros: pricing.priceUsdMicros,
      paymentMethod: "x402",
      txHash,
      receiptId: receipt.receiptId,
    });

    await client.query("COMMIT");

    res.setHeader("X-Access-Receipt", receipt.receiptId);
    next();
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      "[x402Gate] Receipt/Ledger transaction failed:",
      errMessage
    );
    res.status(500).json({ error: "Payment processing failed" });
  } finally {
    client.release();
  }
}
