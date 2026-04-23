import { PinataSDK } from "pinata";
import { env } from "../config/env.js";
import type { EncryptedPayload, EnvelopeEncryptedPayload } from "./crypto.js";
import { pseudonymize } from "./sanitize.js";

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

// ══════════════════════════════════════════════════════════════
// V1 Legacy Upload (기존 HKDF 구조)
// ══════════════════════════════════════════════════════════════

/**
 * [V1 Legacy] 암호화된 데이터를 IPFS(Pinata)에 업로드
 *
 * @deprecated 신규 attestation에는 uploadEncryptedDataV2() 사용.
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
      creator: pseudonymize(metadata.creator),  // T3: PII 보호
      encryptedAt: new Date().toISOString(),
    },
  };

  // Pinata v3 SDK: upload.public.json()
  const result = await pinata.upload.public
    .json(data)
    .name(`proofweave-${metadata.attestationId}`)
    .keyvalues({
      attestationId: metadata.attestationId,
      creator: pseudonymize(metadata.creator),  // T3: PII 보호
      aiModel: metadata.aiModel,
    });

  return result.cid;
}

// ══════════════════════════════════════════════════════════════
// V2 Upload — Envelope Encryption (봉투 암호화)
// ══════════════════════════════════════════════════════════════

/**
 * [V2] 봉투 암호화 데이터를 IPFS에 업로드
 *
 * wrappedDEK 포함 — KEK 교체 시 IPFS 데이터 불변.
 */
export async function uploadEncryptedDataV2(
  envelope: EnvelopeEncryptedPayload,
  metadata: {
    attestationId: string;
    contentHash: string;
    aiModel: string;
    creator: string;
  }
): Promise<string> {
  const data = {
    version: 2,
    encrypted: envelope.encrypted,   // 데이터 ciphertext
    wrappedDEK: envelope.wrappedDEK, // KEK로 래핑된 DEK
    meta: {
      attestationId: metadata.attestationId,
      contentHash: metadata.contentHash,
      aiModel: metadata.aiModel,
      creator: pseudonymize(metadata.creator),
      encryptedAt: new Date().toISOString(),
    },
  };

  const result = await pinata.upload.public
    .json(data)
    .name(`proofweave-v2-${metadata.attestationId}`)
    .keyvalues({
      attestationId: metadata.attestationId,
      creator: pseudonymize(metadata.creator),
      aiModel: metadata.aiModel,
      encVersion: "2",
    });

  return result.cid;
}

// ══════════════════════════════════════════════════════════════
// Download — v1/v2 자동 분기
// ══════════════════════════════════════════════════════════════

/** V1 IPFS 데이터 구조 */
export interface IPFSPayloadV1 {
  version: 1;
  encrypted: EncryptedPayload;
  meta: {
    attestationId: string;
    contentHash: string;
    aiModel: string;
    creator: string;
    encryptedAt: string;
  };
}

/** V2 IPFS 데이터 구조 (봉투 암호화) */
export interface IPFSPayloadV2 {
  version: 2;
  encrypted: EncryptedPayload;
  wrappedDEK: EncryptedPayload;
  meta: {
    attestationId: string;
    contentHash: string;
    aiModel: string;
    creator: string;
    encryptedAt: string;
  };
}

export type IPFSPayload = IPFSPayloadV1 | IPFSPayloadV2;

/**
 * IPFS에서 암호화된 데이터 다운로드 (v1/v2 자동 분기)
 *
 * @param cid IPFS CID
 * @returns V1 또는 V2 페이로드
 */
export async function downloadIPFSPayload(cid: string): Promise<IPFSPayload> {
  // CID 포맷 검증 (SSRF/인젝션 방지)
  if (!/^[a-zA-Z0-9]+$/.test(cid)) {
    throw new Error(`Invalid CID format: ${cid}`);
  }

  const gatewayUrl = `https://${env.PINATA_GATEWAY}/ipfs/${cid}`;
  const response = await fetch(gatewayUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // W-1 fix: 스키마 검증
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid IPFS data: not an object for CID: ${cid}`);
  }

  const d = data as Record<string, unknown>;
  if (!("encrypted" in d) || typeof d.encrypted !== "object" || d.encrypted === null) {
    throw new Error(`Invalid IPFS data: missing 'encrypted' for CID: ${cid}`);
  }

  const enc = d.encrypted as Record<string, unknown>;
  if (typeof enc.ciphertext !== "string" || typeof enc.iv !== "string" || typeof enc.tag !== "string") {
    throw new Error(`Invalid IPFS data: encrypted payload incomplete for CID: ${cid}`);
  }

  // V2 검증: wrappedDEK 존재 확인
  const version = typeof d.version === "number" ? d.version : 1;

  if (version === 2) {
    if (!("wrappedDEK" in d) || typeof d.wrappedDEK !== "object" || d.wrappedDEK === null) {
      throw new Error(`Invalid V2 IPFS data: missing 'wrappedDEK' for CID: ${cid}`);
    }
    const wdek = d.wrappedDEK as Record<string, unknown>;
    if (typeof wdek.ciphertext !== "string" || typeof wdek.iv !== "string" || typeof wdek.tag !== "string") {
      throw new Error(`Invalid V2 IPFS data: wrappedDEK incomplete for CID: ${cid}`);
    }
    return data as IPFSPayloadV2;
  }

  return data as IPFSPayloadV1;
}

/**
 * [V1 Legacy] 다운로드 함수 — 기존 코드 호환용
 *
 * @deprecated 신규 코드에는 downloadIPFSPayload() 사용.
 */
export async function downloadEncryptedData(cid: string): Promise<IPFSPayloadV1> {
  const payload = await downloadIPFSPayload(cid);
  if (payload.version === 2) {
    // V2 데이터를 V1 인터페이스로 호출한 경우 — 에러
    throw new Error("Cannot use V1 download for V2 envelope data. Use downloadIPFSPayload().");
  }
  return payload;
}
