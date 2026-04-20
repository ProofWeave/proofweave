import { randomBytes, createHash } from "crypto";
import { verifyMessage } from "viem";
import { pool } from "./db.js";

const API_KEY_PREFIX = "pw_";
const API_KEY_BYTES = 24; // 48 hex chars
const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 서명 메시지 유효시간: 5분

/** API Key 생성: "pw_" + 48 hex chars */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(API_KEY_BYTES).toString("hex");
}

/** API Key → SHA-256 해시 (DB 저장용) */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * 서명 메시지 파싱 + 검증
 * 형식:
 *   ProofWeave API Key Request
 *   Address: 0x...
 *   Timestamp: 2026-04-12T03:00:00Z
 *   Action: register
 */
export function parseSignatureMessage(message: string): {
  address: string;
  timestamp: string;
  action: "register" | "rotate";
} | null {
  const lines = message.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== "ProofWeave API Key Request") return null;

  const addressLine = lines.find((l) => l.startsWith("Address:"));
  const timestampLine = lines.find((l) => l.startsWith("Timestamp:"));
  const actionLine = lines.find((l) => l.startsWith("Action:"));

  if (!addressLine || !timestampLine || !actionLine) return null;

  const address = addressLine.replace("Address:", "").trim();
  const timestamp = timestampLine.replace("Timestamp:", "").trim();
  const action = actionLine.replace("Action:", "").trim();

  if (action !== "register" && action !== "rotate") return null;

  return { address, timestamp, action };
}

/** 타임스탬프 유효성 검증 (5분 이내) */
export function isTimestampValid(timestamp: string): boolean {
  const ts = new Date(timestamp).getTime();
  if (isNaN(ts)) return false;
  const diff = Date.now() - ts;
  // 미래 타임스탬프 거부, 과거 5분 이내만 유효
  return diff >= 0 && diff <= SIGNATURE_TTL_MS;
}

/** EIP-191 서명 검증 */
export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid;
  } catch {
    return false;
  }
}

// ── 리플레이 방지 ────────────────────────────────────────────

/** 서명 해시 생성 */
export function hashSignature(signature: string): string {
  return createHash("sha256").update(signature).digest("hex");
}

/** 서명이 이미 소비되었는지 확인 */
export async function isSignatureConsumed(signature: string): Promise<boolean> {
  const sigHash = hashSignature(signature);
  const result = await pool.query(
    `SELECT 1 FROM consumed_signatures WHERE sig_hash = $1`,
    [sigHash]
  );
  return result.rows.length > 0;
}

/** 서명을 소비 처리 (DB에 기록) */
export async function consumeSignature(
  signature: string,
  walletAddress: string
): Promise<void> {
  const sigHash = hashSignature(signature);
  await pool.query(
    `INSERT INTO consumed_signatures (sig_hash, wallet_address) VALUES ($1, $2)
     ON CONFLICT (sig_hash) DO NOTHING`,
    [sigHash, walletAddress.toLowerCase()]
  );
}

// ── API Key CRUD ────────────────────────────────────────────

/** 해당 지갑에 활성 API Key가 있는지 확인 */
export async function hasActiveApiKey(walletAddress: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM api_keys
     WHERE wallet_address = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [walletAddress.toLowerCase()]
  );
  return result.rows.length > 0;
}

/** 새 API Key 생성 → DB 저장 → 평문 키 반환 */
export async function createApiKey(walletAddress: string): Promise<string> {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  // 동시 요청 방어: 기존 active 키가 있으면 먼저 revoke
  await pool.query(
    `UPDATE api_keys SET revoked_at = NOW()
     WHERE wallet_address = $1 AND revoked_at IS NULL`,
    [walletAddress.toLowerCase()]
  );

  await pool.query(
    `INSERT INTO api_keys (key_hash, wallet_address) VALUES ($1, $2)`,
    [keyHash, walletAddress.toLowerCase()]
  );

  return apiKey; // 평문은 이 시점에서만 반환
}

/** API Key로 소유자 조회 (null = 유효하지 않음) */
export async function verifyApiKey(
  key: string
): Promise<{ walletAddress: string; smartWalletAddress: string | null; eoaAddress: string | null } | null> {
  if (!key.startsWith(API_KEY_PREFIX)) return null;

  const keyHash = hashApiKey(key);
  const result = await pool.query(
    `SELECT wallet_address, smart_wallet_address, eoa_address FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash]
  );

  if (result.rows.length === 0) return null;
  return {
    walletAddress: result.rows[0].wallet_address,
    smartWalletAddress: result.rows[0].smart_wallet_address ?? null,
    eoaAddress: result.rows[0].eoa_address ?? null,
  };
}

/** 특정 지갑의 모든 API Key 무효화 */
export async function revokeApiKeys(walletAddress: string): Promise<number> {
  const result = await pool.query(
    `UPDATE api_keys SET revoked_at = NOW()
     WHERE wallet_address = $1 AND revoked_at IS NULL`,
    [walletAddress.toLowerCase()]
  );
  return result.rowCount ?? 0;
}

/**
 * Rotate: 기존 키 폐기 + 새 키 발급 (원자적 트랜잭션)
 * Codex #4: 부분 실패 방지
 */
export async function rotateApiKey(
  walletAddress: string,
  signature: string
): Promise<{ apiKey: string; revokedCount: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Advisory lock: 같은 wallet_address에 대한 모든 트랜잭션 완전 직렬화
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [walletAddress.toLowerCase()]
    );

    // 1. 서명 소비 기록
    const sigHash = hashSignature(signature);
    await client.query(
      `INSERT INTO consumed_signatures (sig_hash, wallet_address) VALUES ($1, $2)
       ON CONFLICT (sig_hash) DO NOTHING`,
      [sigHash, walletAddress.toLowerCase()]
    );

    // 2. 기존 키의 smart_wallet_address, eoa_address 조회 (이관용)
    const existingWallet = await client.query(
      `SELECT smart_wallet_address, eoa_address FROM api_keys
       WHERE wallet_address = $1 AND revoked_at IS NULL
       LIMIT 1`,
      [walletAddress.toLowerCase()]
    );
    const smartWalletAddress = existingWallet.rows[0]?.smart_wallet_address ?? null;
    const eoaAddress = existingWallet.rows[0]?.eoa_address ?? null;

    // 3. 기존 키 폐기
    const revokeResult = await client.query(
      `UPDATE api_keys SET revoked_at = NOW()
       WHERE wallet_address = $1 AND revoked_at IS NULL`,
      [walletAddress.toLowerCase()]
    );
    const revokedCount = revokeResult.rowCount ?? 0;

    // 4. 새 키 발급 (smart_wallet_address + eoa_address 이관)
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    await client.query(
      `INSERT INTO api_keys (key_hash, wallet_address, smart_wallet_address, eoa_address) VALUES ($1, $2, $3, $4)`,
      [keyHash, walletAddress.toLowerCase(), smartWalletAddress, eoaAddress]
    );

    await client.query("COMMIT");
    return { apiKey, revokedCount };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
