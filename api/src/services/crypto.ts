import { createHash, createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";
import stringify from "json-stable-stringify";

/**
 * ProofWeave 암호화/해시 서비스
 *
 * 키 아키텍처:
 *   DATA_ENCRYPTION_KEY (마스터, 서버 전용)
 *     └── HKDF(master, salt=attestationId) → 파생키 → attestation별 AES-256-GCM
 *
 * 에이전트는 평문만 주고받음. 암복호화는 서버에서 처리.
 */

export interface EncryptedPayload {
  /** AES-256-GCM 암호문 (base64) */
  ciphertext: string;
  /** 초기화 벡터 12바이트 (base64) */
  iv: string;
  /** GCM 인증 태그 16바이트 (base64) */
  tag: string;
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

// ── HKDF 키 파생 ──────────────────────────────────────────

/**
 * 마스터 키에서 attestation별 고유 AES-256 키 파생
 *
 * HKDF-SHA256(masterKey, salt=attestationId, info="proofweave-aes", length=32)
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

// ── AES-256-GCM 암복호화 ─────────────────────────────────

/**
 * AES-256-GCM 암호화
 *
 * @param plaintext 원본 데이터 (UTF-8 문자열)
 * @param masterKeyHex DATA_ENCRYPTION_KEY (hex)
 * @param attestationId HKDF salt
 * @returns { ciphertext, iv, tag } 모두 base64
 */
export function encryptData(
  plaintext: string,
  masterKeyHex: string,
  attestationId: string
): EncryptedPayload {
  const key = deriveKey(masterKeyHex, attestationId);
  const iv = randomBytes(12); // GCM 권장 12바이트

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
 * AES-256-GCM 복호화
 *
 * @param encrypted { ciphertext, iv, tag } 모두 base64
 * @param masterKeyHex DATA_ENCRYPTION_KEY (hex)
 * @param attestationId HKDF salt
 * @returns 복호화된 평문 (UTF-8)
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
