import { Router } from "express";
import { getPrice, setPrice } from "../services/pricing.js";
import { authenticate } from "../middleware/authenticate.js";
import { getAttestationFromDB } from "../services/attestation.js";

export const pricingRouter = Router();

/**
 * POST /pricing
 * 가격 정책 설정 (attestation의 실제 creator만 가능)
 */
pricingRouter.post("/pricing", authenticate, async (req, res) => {
  const { attestationId, priceUsdMicros } = req.body;
  const creator = req.apiKeyOwner;

  if (!creator) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!attestationId || priceUsdMicros === undefined) {
    res.status(400).json({ error: "attestationId and priceUsdMicros are required" });
    return;
  }

  if (typeof priceUsdMicros !== "number" || priceUsdMicros < 0) {
    res.status(400).json({ error: "priceUsdMicros must be a non-negative number" });
    return;
  }

  // Phase 2-5: attestation 존재 + creator 일치 검증
  // DB에 attestation이 없으면 가격 설정 불가 (선점 방지)
  const attestation = await getAttestationFromDB(attestationId);
  if (!attestation) {
    res.status(404).json({
      error: "Attestation not found",
      message: "You must create an attestation before setting its price",
    });
    return;
  }

  if (attestation.creator.toLowerCase() !== creator.toLowerCase()) {
    res.status(403).json({
      error: "Not authorized",
      message: "Only the attestation creator can set pricing",
    });
    return;
  }

  // T5: 1시간 쿨다운 검증 — 기존 가격이 있고, 최근 1시간 이내 수정됐으면 차단
  const existingPrice = await getPrice(attestationId);
  if (existingPrice) {
    const { pool } = await import("../services/db.js");
    const cooldownResult = await pool.query(
      `SELECT updated_at FROM pricing_policies WHERE attestation_id = $1`,
      [attestationId]
    );
    if (cooldownResult.rows.length > 0 && cooldownResult.rows[0].updated_at) {
      const updatedAt = new Date(cooldownResult.rows[0].updated_at);
      const now = new Date();
      const diffMs = now.getTime() - updatedAt.getTime();
      const cooldownMs = 60 * 60 * 1000; // 1시간
      if (diffMs < cooldownMs) {
        const remainingMs = cooldownMs - diffMs;
        const remainingMin = Math.ceil(remainingMs / 60_000);
        res.status(429).json({
          error: "Price change cooldown active",
          message: `가격 변경 후 1시간 동안 재변경이 불가합니다. 약 ${remainingMin}분 후 다시 시도하세요.`,
          cooldownRemainingMs: remainingMs,
          cooldownEndsAt: new Date(updatedAt.getTime() + cooldownMs).toISOString(),
        });
        return;
      }
    }
  }

  const policy = await setPrice(attestationId, creator, priceUsdMicros);

  if (!policy) {
    res.status(403).json({
      error: "Not authorized to set pricing for this attestation",
      message: "Only the original creator can modify pricing",
    });
    return;
  }

  res.status(200).json({
    attestationId: policy.attestationId,
    priceUsdMicros: policy.priceUsdMicros,
    priceUsd: (policy.priceUsdMicros / 1_000_000).toFixed(6),
    currency: policy.currency,
    network: policy.network,
  });
});

/**
 * GET /pricing/:attestationId
 * 가격 조회 (공개)
 */
pricingRouter.get("/pricing/:attestationId", async (req, res) => {
  const { attestationId } = req.params;

  const pricing = await getPrice(attestationId);

  if (!pricing) {
    res.status(200).json({
      attestationId,
      priceUsdMicros: 0,
      priceUsd: "0.000000",
      currency: "USDC",
      network: "eip155:84532",
      note: "No pricing policy set — defaults to free",
    });
    return;
  }

  res.status(200).json({
    attestationId: pricing.attestationId,
    priceUsdMicros: pricing.priceUsdMicros,
    priceUsd: (pricing.priceUsdMicros / 1_000_000).toFixed(6),
    currency: pricing.currency,
    network: pricing.network,
  });
});
