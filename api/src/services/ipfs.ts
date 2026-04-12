import { PinataSDK } from "pinata";
import { env } from "../config/env.js";
import type { EncryptedPayload } from "./crypto.js";

export const pinata = new PinataSDK({
  pinataJwt: env.PINATA_JWT,
  pinataGateway: env.PINATA_GATEWAY,
});

/** Pinata 연결 테스트 */
export async function testPinataConnection(): Promise<boolean> {
  try {
    await pinata.testAuthentication();
    return true;
  } catch {
    return false;
  }
}

/**
 * 암호화된 데이터를 IPFS(Pinata)에 업로드
 *
 * @param payload 암호화된 페이로드 { ciphertext, iv, tag }
 * @param metadata 추가 메타데이터 (attestationId, aiModel 등)
 * @returns IPFS CID
 */
export async function uploadEncryptedData(
  payload: EncryptedPayload,
  metadata: {
    attestationId: string;
    contentHash: string;
    aiModel: string;
    creator: string;
  }
): Promise<string> {
  const data = {
    version: 1,
    encrypted: payload,
    meta: {
      attestationId: metadata.attestationId,
      contentHash: metadata.contentHash,
      aiModel: metadata.aiModel,
      creator: metadata.creator,
      encryptedAt: new Date().toISOString(),
    },
  };

  // Pinata v3 SDK: upload.public.json()
  const result = await pinata.upload.public
    .json(data)
    .name(`proofweave-${metadata.attestationId}`)
    .keyvalues({
      attestationId: metadata.attestationId,
      creator: metadata.creator,
      aiModel: metadata.aiModel,
    });

  return result.cid;
}

/**
 * IPFS(Pinata Gateway)에서 암호화된 데이터 다운로드
 *
 * @param cid IPFS CID
 * @returns 저장된 JSON 구조 { version, encrypted, meta }
 */
export async function downloadEncryptedData(cid: string): Promise<{
  version: number;
  encrypted: EncryptedPayload;
  meta: {
    attestationId: string;
    contentHash: string;
    aiModel: string;
    creator: string;
    encryptedAt: string;
  };
}> {
  // CID 포맷 검증 (SSRF/인젝션 방지)
  if (!/^[a-zA-Z0-9]+$/.test(cid)) {
    throw new Error(`Invalid CID format: ${cid}`);
  }

  // Pinata gateway에서 CID로 직접 fetch
  const gatewayUrl = `https://${env.PINATA_GATEWAY}/ipfs/${cid}`;
  const response = await fetch(gatewayUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // W-1 fix: 스키마 검증 강화 (외부 저장소는 신뢰 경계 밖)
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid IPFS data: not an object for CID: ${cid}`);
  }

  const d = data as Record<string, unknown>;
  if (!("encrypted" in d) || typeof d.encrypted !== "object" || d.encrypted === null) {
    throw new Error(`Invalid IPFS data: missing 'encrypted' field for CID: ${cid}`);
  }

  const enc = d.encrypted as Record<string, unknown>;
  if (typeof enc.ciphertext !== "string" || typeof enc.iv !== "string" || typeof enc.tag !== "string") {
    throw new Error(`Invalid IPFS data: encrypted payload missing ciphertext/iv/tag for CID: ${cid}`);
  }

  return data as {
    version: number;
    encrypted: EncryptedPayload;
    meta: {
      attestationId: string;
      contentHash: string;
      aiModel: string;
      creator: string;
      encryptedAt: string;
    };
  };
}
