import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { createAttestation } from "../services/attestation.js";
import { setPrice } from "../services/pricing.js";
import { pseudonymize } from "../services/sanitize.js";
import {
  assertUsageEventLinkable,
  linkUsageToAttestation,
} from "../services/analytics.js";

export const attestRouter = Router();

/**
 * POST /attest
 * 데이터 등록 (hash → encrypt → IPFS → chain → DB)
 *
 * Headers: X-API-Key (required)
 * Body: { data: object, aiModel: string }
 *
 * creator 결정 로직:
 * - CLI/지갑 사용자 (0x...): 자신의 EVM 주소를 그대로 사용
 * - 웹 사용자 (web:email): CDP Smart Wallet 주소를 사용 (register-web 시 자동 생성)
 */
attestRouter.post("/attest", authenticate, async (req, res) => {
  const { data, aiModel, priceUsdMicros, usageEventId } = req.body;

  // 필수 필드 검증
  if (!data || typeof data !== "object") {
    res.status(400).json({ error: "data (object) is required" });
    return;
  }

  // 데이터 크기 제한 (64KB) — 서버 리소스 + IPFS 비용 보호
  const dataSize = JSON.stringify(data).length;
  if (dataSize > 65_536) {
    res.status(413).json({ error: `data too large (${dataSize} bytes, max 65536)` });
    return;
  }

  if (!aiModel || typeof aiModel !== "string") {
    res.status(400).json({ error: "aiModel (string) is required" });
    return;
  }

  const apiKeyOwner = req.apiKeyOwner!;
  const isWebUser = apiKeyOwner.startsWith("web:");

  if (usageEventId !== undefined) {
    if (typeof usageEventId !== "string" || usageEventId.trim().length === 0) {
      res.status(400).json({ error: "usageEventId must be a non-empty string" });
      return;
    }

    try {
      await assertUsageEventLinkable(usageEventId, apiKeyOwner);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "Invalid usageEventId";
      res.status(400).json({ error: "Invalid usageEventId", detail });
      return;
    }
  }

  // creator 결정: 웹 사용자 → Smart Wallet, CLI → 자신의 주소
  let creator: string;
  if (isWebUser) {
    const smartWallet = req.smartWalletAddress;
    if (!smartWallet) {
      res.status(403).json({
        error: "No smart wallet associated with this account. Re-register to create one.",
        hint: "POST /auth/register-web to generate a CDP Smart Wallet",
      });
      return;
    }
    creator = smartWallet;
  } else {
    creator = apiKeyOwner;
  }

  try {
    const result = await createAttestation({
      data: isWebUser ? { ...data as Record<string, unknown>, submittedBy: pseudonymize(apiKeyOwner) } : data,
      creator,
      aiModel,
    });

    let analyticsLinked = false;
    let analyticsError: string | undefined;
    if (typeof usageEventId === "string") {
      try {
        await linkUsageToAttestation({
          usageEventId,
          attestationId: result.attestationId,
          owner: apiKeyOwner,
        });
        analyticsLinked = true;
      } catch (err: unknown) {
        analyticsError = err instanceof Error ? err.message : "Analytics baseline link failed";
        console.warn("[POST /attest] analytics baseline link failed:", analyticsError);
      }
    }

    // priceUsdMicros가 지정된 경우 자동 가격 설정 (실패해도 attest 성공은 유지)
    let pricing = null;
    let pricingError: string | undefined;
    if (typeof priceUsdMicros === "number" && priceUsdMicros > 0) {
      try {
        pricing = await setPrice(result.attestationId, creator, priceUsdMicros);
      } catch (err: unknown) {
        pricingError = err instanceof Error ? err.message : "Pricing failed";
        console.warn("[POST /attest] setPrice failed (attest succeeded):", pricingError);
      }
    }

    res.status(201).json({
      attestationId: result.attestationId,
      contentHash: result.contentHash,
      ipfsCid: result.ipfsCid,
      txHash: result.txHash,
      creator,
      aiModel,
      // T3: submittedBy 응답에서 제거 (PII 보호)
      pricing: pricing
        ? { priceUsdMicros: pricing.priceUsdMicros, priceUsd: (pricing.priceUsdMicros / 1_000_000).toFixed(6) }
        : undefined,
      analytics: typeof usageEventId === "string"
        ? { usageEventId, baselineLinked: analyticsLinked, error: analyticsError }
        : undefined,
      message: "Attestation created and recorded on-chain",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // 중복 attestation
    if (message.includes("AlreadyAttested")) {
      res.status(409).json({ error: "This data has already been attested by this creator" });
      return;
    }

    console.error("[POST /attest] Error:", message);
    res.status(500).json({ error: "Failed to create attestation", detail: message });
  }
});
