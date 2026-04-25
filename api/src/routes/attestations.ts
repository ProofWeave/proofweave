import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { x402Gate } from "../middleware/x402Gate.js";
import {
  getAttestationFromDB,
  getAttestationDetail,
  verifyAttestation,
  searchAttestations,
  getSearchFacets,
} from "../services/attestation.js";
import { recordDataReuseOnce } from "../services/analytics.js";

export const attestationsRouter = Router();

/**
 * GET /attestations/:id
 * 기본 정보 조회 (무료, 인증 필요)
 */
attestationsRouter.get("/attestations/:id", authenticate, async (req, res) => {
  const id = req.params.id as string;

  try {
    const attestation = await getAttestationFromDB(id);
    if (!attestation) {
      res.status(404).json({ error: "Attestation not found" });
      return;
    }

    res.status(200).json({
      attestationId: attestation.attestationId,
      contentHash: attestation.contentHash,
      creator: attestation.creator,
      aiModel: attestation.aiModel,
      offchainRef: attestation.offchainRef,
      blockNumber: attestation.blockNumber,
      blockTimestamp: attestation.blockTimestamp,
      txHash: attestation.txHash,
      createdAt: attestation.createdAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Failed to get attestation", detail: message });
  }
});

/**
 * GET /attestations/:id/detail
 * 유료 상세 조회 — x402Gate 통과 후 IPFS → AES 복호화 → 평문 반환
 */
attestationsRouter.get("/attestations/:id/detail", authenticate, x402Gate, async (req, res) => {
  const id = req.params.id as string;

  try {
    const { plaintext, attestation } = await getAttestationDetail(id);
    const consumer = req.apiKeyOwner;
    if (consumer) {
      try {
        await recordDataReuseOnce({
          attestationId: id,
          consumer,
          receiptId: req.accessContext?.receiptId ?? null,
          accessType: req.accessContext?.accessType ?? "free",
        });
      } catch (analyticsErr) {
        console.error("[GET /attestations/:id/detail] Failed to record reuse:", analyticsErr);
      }
    }

    res.status(200).json({
      attestationId: attestation.attestationId,
      contentHash: attestation.contentHash,
      creator: attestation.creator,
      aiModel: attestation.aiModel,
      txHash: attestation.txHash,
      data: plaintext,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("not found")) {
      res.status(404).json({ error: "Attestation not found" });
      return;
    }

    console.error("[GET /attestations/:id/detail] Error:", message);
    res.status(500).json({ error: "Failed to get attestation detail", detail: message });
  }
});

/**
 * GET /verify/:contentHash
 * 온체인 검증 (공개, 인증 불필요)
 *
 * Query: ?creator=0x... (필수)
 */
attestationsRouter.get("/verify/:contentHash", async (req, res) => {
  const { contentHash } = req.params;
  const creator = req.query.creator as string | undefined;

  if (!contentHash) {
    res.status(400).json({ error: "contentHash is required" });
    return;
  }
  if (!creator) {
    res.status(400).json({ error: "creator query parameter is required" });
    return;
  }

  try {
    const result = await verifyAttestation(contentHash, creator);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("not found on-chain")) {
      res.status(404).json({
        verified: false,
        error: "Attestation not found on-chain",
        contentHash,
        creator,
      });
      return;
    }

    // N-3 fix: RPC 장애 등은 502 (Bad Gateway)로 구분
    if (message.includes("Chain verification failed")) {
      console.error("[GET /verify] Chain error:", message);
      res.status(502).json({ error: "Chain verification temporarily unavailable", detail: message });
      return;
    }

    res.status(500).json({ error: "Verification failed", detail: message });
  }
});

/**
 * GET /search/facets
 * 검색 필터 옵션 동적 조회 (인증 필요)
 * T4: DB에서 실제 존재하는 domain/problemType 목록 반환
 */
attestationsRouter.get("/search/facets", authenticate, async (_req, res) => {
  try {
    const facets = await getSearchFacets();
    res.status(200).json(facets);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Failed to get facets", detail: message });
  }
});

/**
 * GET /search
 * 검색 (인증 필요)
 *
 * Query: ?creator=0x...&aiModel=gpt-4o&limit=20&offset=0
 */
attestationsRouter.get("/search", authenticate, async (req, res) => {
  const { q, domain, problemType, creator, aiModel, limit, offset } = req.query;

  // limit/offset 입력 검증
  const parsedLimit = limit ? Math.min(Math.max(Number(limit) || 10, 1), 100) : 10;
  const parsedOffset = offset ? Math.max(Number(offset) || 0, 0) : 0;

  try {
    const result = await searchAttestations({
      q: q as string | undefined,
      domain: domain as string | undefined,
      problemType: problemType as string | undefined,
      creator: creator as string | undefined,
      aiModel: aiModel as string | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.status(200).json({
      count: result.attestations.length,
      totalCount: result.totalCount,
      attestations: result.attestations,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Search failed", detail: message });
  }
});
