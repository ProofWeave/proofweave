import { createHash, createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";
import stringify from "json-stable-stringify";

/**
 * ProofWeave 암호화/해시 서비스
 *
 * 키 아키텍처 (v2 — Envelope Encryption):
 *
 *   KEK = DATA_ENCRYPTION_KEY (마스터, 서버 전용, 교체 가능)
 *   DEK = attestation별 랜덤 32바이트 (데이터 암호화 전용)
 *
 *   등록: DEK 생성 → AES-GCM(data, DEK) → AES-GCM(DEK, KEK) → IPFS
 *   조회: AES-GCM⁻¹(wrappedDEK, KEK) → DEK → AES-GCM⁻¹(data, DEK) → 평문
 *
 * 레거시 (v1 — HKDF):
 *   DATA_ENCRYPTION_KEY → HKDF(salt=contentHash) → 파생키 → AES-256-GCM
 *   기존 데이터 복호화 전용. 신규 데이터에는 사용하지 않음.
 */

export interface EncryptedPayload {
  /** AES-256-GCM 암호문 (base64) */
  ciphertext: string;
  /** 초기화 벡터 12바이트 (base64) */
  iv: string;
  /** GCM 인증 태그 16바이트 (base64) */
  tag: string;
}

/** V2 암호화 결과 (데이터 + 래핑된 DEK) */
export interface EnvelopeEncryptedPayload {
  /** 데이터 암호문 */
  encrypted: EncryptedPayload;
  /** KEK로 래핑된 DEK */
  wrappedDEK: EncryptedPayload;
}

// ── 해시 ────────────────────────────────────────────────────

/**
 * Canonical JSON → SHA-256 해시 (온체인 contentHash)
 *
 * json-stable-stringify로 키 순서를 결정적으로 정렬한 후 SHA-256.
 * 결과는 0x 접두사 포함 bytes32 hex.
 */
export function canonicalHash(data: object): `0x${string}` {
  const canonical = stringify(data);
  if (!canonical) throw new Error("Cannot stringify data");
  const hash = createHash("sha256").update(canonical, "utf-8").digest("hex");
  return `0x${hash}`;
}

// ══════════════════════════════════════════════════════════════
// V1 Legacy — HKDF 기반 (기존 데이터 복호화 전용)
// ══════════════════════════════════════════════════════════════

/**
 * [V1 Legacy] 마스터 키에서 attestation별 고유 AES-256 키 파생
 *
 * @deprecated 신규 attestation에는 V2 (Envelope) 사용.
 *   기존 encryption_version=1 데이터 복호화 전용.
 */
export function deriveKey(masterKeyHex: string, attestationId: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  if (masterKey.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }

  const derived = hkdfSync(
    "sha256",
    masterKey,
    attestationId,           // salt (attestation 고유)
    "proofweave-aes",        // info (어플리케이션 컨텍스트)
    32                       // 32바이트 = AES-256
  );

  return Buffer.from(derived);
}

/**
 * [V1 Legacy] AES-256-GCM 암호화 (HKDF 파생키)
 *
 * @deprecated 신규 attestation에는 encryptDataV2() 사용.
 */
export function encryptData(
  plaintext: string,
  masterKeyHex: string,
  attestationId: string
): EncryptedPayload {
  const key = deriveKey(masterKeyHex, attestationId);
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * [V1 Legacy] AES-256-GCM 복호화 (HKDF 파생키)
 *
 * encryption_version=1 데이터에 대해 사용.
 */
export function decryptData(
  encrypted: EncryptedPayload,
  masterKeyHex: string,
  attestationId: string
): string {
  const key = deriveKey(masterKeyHex, attestationId);
  const iv = Buffer.from(encrypted.iv, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}

// ══════════════════════════════════════════════════════════════
// V2 — Envelope Encryption (봉투 암호화)
// ══════════════════════════════════════════════════════════════

/**
 * 32바이트 랜덤 DEK(Data Encryption Key) 생성
 */
export function generateDEK(): Buffer {
  return randomBytes(32);
}

// ── 내부 AES-256-GCM 헬퍼 (raw Buffer 키 사용) ──────────────

function aesGcmEncrypt(plainBuf: Buffer, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function aesGcmDecrypt(payload: EncryptedPayload, key: Buffer): Buffer {
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── DEK 래핑/언래핑 ─────────────────────────────────────────

/**
 * DEK를 KEK(마스터 키)로 래핑 (AES-256-GCM)
 *
 * KEK 교체 시 이 wrappedDEK만 재생성하면 됨 (IPFS 데이터 불변).
 */
export function wrapDEK(dek: Buffer, kekHex: string): EncryptedPayload {
  const kek = Buffer.from(kekHex, "hex");
  if (kek.length !== 32) {
    throw new Error("KEK (DATA_ENCRYPTION_KEY) must be 32 bytes");
  }
  return aesGcmEncrypt(dek, kek);
}

/**
 * 래핑된 DEK를 KEK로 복원
 */
export function unwrapDEK(wrapped: EncryptedPayload, kekHex: string): Buffer {
  const kek = Buffer.from(kekHex, "hex");
  if (kek.length !== 32) {
    throw new Error("KEK (DATA_ENCRYPTION_KEY) must be 32 bytes");
  }
  return aesGcmDecrypt(wrapped, kek);
}

// ── V2 암복호화 ─────────────────────────────────────────────

/**
 * [V2] 봉투 암호화 — DEK 생성 → 데이터 암호화 → DEK 래핑
 *
 * @param plaintext 원본 데이터 (UTF-8)
 * @param kekHex 마스터 키 (KEK, hex)
 * @returns { encrypted, wrappedDEK }
 */
export function encryptDataV2(
  plaintext: string,
  kekHex: string
): EnvelopeEncryptedPayload {
  // 1. attestation별 랜덤 DEK 생성
  const dek = generateDEK();

  // 2. DEK로 데이터 암호화
  const encrypted = aesGcmEncrypt(Buffer.from(plaintext, "utf-8"), dek);

  // 3. KEK로 DEK 래핑
  const wrappedDEK = wrapDEK(dek, kekHex);

  return { encrypted, wrappedDEK };
}

/**
 * [V2] 봉투 복호화 — DEK 언래핑 → 데이터 복호화
 *
 * @param encrypted 데이터 암호문
 * @param wrappedDEK KEK로 래핑된 DEK
 * @param kekHex 마스터 키 (KEK, hex)
 * @returns 복호화된 평문 (UTF-8)
 */
export function decryptDataV2(
  encrypted: EncryptedPayload,
  wrappedDEK: EncryptedPayload,
  kekHex: string
): string {
  // 1. KEK로 DEK 복원
  const dek = unwrapDEK(wrappedDEK, kekHex);

  // 2. DEK로 데이터 복호화
  return aesGcmDecrypt(encrypted, dek).toString("utf-8");
}

