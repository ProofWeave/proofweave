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

  const creator = req.apiKeyOwner!;

  try {
    const result = await createAttestation({ data, creator, aiModel });

    res.status(201).json({
      attestationId: result.attestationId,
      contentHash: result.contentHash,
      ipfsCid: result.ipfsCid,
      txHash: result.txHash,
      creator,
      aiModel,
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
