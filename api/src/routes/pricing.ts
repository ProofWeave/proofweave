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
