import { Router } from "express";
import { getPrice, setPrice } from "../services/pricing.js";
import { authenticate } from "../middleware/authenticate.js";

export const pricingRouter = Router();

/**
 * POST /pricing
 * 가격 정책 설정 (creator 본인만)
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

  // TODO: Phase 2-5에서 attestation의 creator가 본인인지 DB 검증
  // 현재는 API Key 소유자가 곧 creator로 간주

  const policy = await setPrice(attestationId, creator, priceUsdMicros);

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
