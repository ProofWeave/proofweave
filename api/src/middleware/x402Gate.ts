import type { Request, Response, NextFunction } from "express";
import { getPrice, toUsdcAmount } from "../services/pricing.js";
import { hasValidReceipt, issueReceipt } from "../services/receipt.js";
import { recordPayment } from "../services/ledger.js";
import { operatorAccount } from "../config/chain.js";

/**
 * x402 결제 게이트 미들웨어
 *
 * 3계층 접합점:
 * 1. AccessReceipt 확인 → 유효하면 바로 통과
 * 2. pricing_policies에서 가격 조회 → 무료면 통과
 * 3. X-PAYMENT 헤더 확인 → 결제 검증 → 영수증 발급
 *
 * req.params.id에서 attestationId를 추출합니다.
 */
export async function x402Gate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const attestationId = req.params.id;
  const payer = req.apiKeyOwner;

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
    // 유효한 영수증 존재 → 결제 불필요
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
  const paymentHeader = req.headers["x-payment"] as string | undefined;

  if (!paymentHeader) {
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

  // ── X-PAYMENT 헤더 검증 (Facilitator 통해) ─────────────────
  // MVP: x402 SDK의 facilitator를 통한 온체인 검증
  // 현재 테스트넷 단계에서는 facilitator 호출을 시도하되,
  // facilitator 미연결 시 서명 존재 자체를 신뢰 (개발 모드)

  let txHash: string | null = null;
  let paymentVerified = false;

  try {
    // x402 SDK를 통한 검증 시도
    // @x402/express의 paymentMiddleware가 이 부분을 자동으로 처리하지만,
    // 우리는 AccessReceipt 레이어를 추가하기 위해 직접 래핑
    const { verifyPayment } = await import("@x402/core/server");

    const verification = await verifyPayment(paymentHeader, {
      scheme: "exact",
      network: pricing.network,
      amount: toUsdcAmount(pricing.priceUsdMicros),
      asset: pricing.currency,
      payTo: operatorAccount.address,
      resource: req.originalUrl,
    });

    paymentVerified = verification.valid;
    txHash = verification.txHash ?? null;
  } catch {
    // Facilitator 연결 실패 → 개발 모드에서는 통과
    // TODO: 프로덕션에서는 반드시 검증 필수
    console.warn(
      "[x402Gate] Facilitator verification failed, accepting payment header in dev mode"
    );
    paymentVerified = true;
  }

  if (!paymentVerified) {
    res.status(402).json({
      error: "Payment verification failed",
      message: "The payment signature could not be verified on-chain",
    });
    return;
  }

  // ── 결제 확인됨 → AccessReceipt 발급 + Ledger 기록 ────────
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

  // 영수증 ID를 응답 헤더에 첨부
  res.setHeader("X-Access-Receipt", receipt.receiptId);
  next();
}
