import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { createAttestation } from "../services/attestation.js";

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
  const { data, aiModel } = req.body;

  // 필수 필드 검증
  if (!data || typeof data !== "object") {
    res.status(400).json({ error: "data (object) is required" });
    return;
  }
  if (!aiModel || typeof aiModel !== "string") {
    res.status(400).json({ error: "aiModel (string) is required" });
    return;
  }

  const apiKeyOwner = req.apiKeyOwner!;
  const isWebUser = apiKeyOwner.startsWith("web:");

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
      data: isWebUser ? { ...data as Record<string, unknown>, submittedBy: apiKeyOwner } : data,
      creator,
      aiModel,
    });

    res.status(201).json({
      attestationId: result.attestationId,
      contentHash: result.contentHash,
      ipfsCid: result.ipfsCid,
      txHash: result.txHash,
      creator,
      aiModel,
      submittedBy: isWebUser ? apiKeyOwner : undefined,
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
