import { createHmac, timingSafeEqual } from "crypto";
import { uuidv7 } from "uuidv7";
import { pool } from "./db.js";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import type { AccessReceipt, ParsedReceipt } from "../types/payment.js";

function getReceiptSecret(): string {
  if (!env.RECEIPT_SECRET) {
    throw new Error("RECEIPT_SECRET is required — set it in .env (openssl rand -hex 32)");
  }
  return env.RECEIPT_SECRET;
}

// ── HMAC 서명 ────────────────────────────────────────────────

/**
 * AccessReceipt HMAC-SHA256 서명 생성
 * payload = "{receiptId}:{attestationId}:{payer}"
 */
export function signReceipt(
  receiptId: string,
  attestationId: string,
  payer: string
): string {
  const payload = `${receiptId}:${attestationId}:${payer.toLowerCase()}`;
  return createHmac("sha256", getReceiptSecret())
    .update(payload)
    .digest("hex");
}

/**
 * HMAC 서명 검증
 */
export function verifyHmac(
  receiptId: string,
  attestationId: string,
  payer: string,
  hmac: string
): boolean {
  const expected = signReceipt(receiptId, attestationId, payer);
  if (expected.length !== hmac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hmac));
}

// ── X-ACCESS-RECEIPT 헤더 파싱 ───────────────────────────────

/**
 * X-ACCESS-RECEIPT 헤더 파싱
 * 형식: "{receiptId}.{hmac}"
 */
export function parseReceiptHeader(header: string): ParsedReceipt | null {
  const dotIndex = header.indexOf(".");
  if (dotIndex === -1) return null;

  const receiptId = header.substring(0, dotIndex);
  const hmac = header.substring(dotIndex + 1);

  if (!receiptId || !hmac) return null;
  return { receiptId, hmac };
}

// ── AccessReceipt 발급 ──────────────────────────────────────

/**
 * AccessReceipt 발급 (UUID v7 + HMAC-SHA256)
 */
export async function issueReceipt(
  attestationId: string,
  payer: string,
  paymentMethod: "smart-wallet",
  amountUsdMicros: number,
  txHash?: string,
  expiresAt?: Date,
  client?: PoolClient
): Promise<AccessReceipt> {
  const receiptId = uuidv7();
  const hmac = signReceipt(receiptId, attestationId, payer);
  const paidAt = new Date().toISOString();

  const queryFn = client ?? pool;
  await queryFn.query(
    `INSERT INTO access_receipts
       (receipt_id, attestation_id, payer, payment_method, tx_hash, amount_usd_micros, hmac, paid_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      receiptId,
      attestationId,
      payer.toLowerCase(),
      paymentMethod,
      txHash ?? null,
      amountUsdMicros,
      hmac,
      paidAt,
      expiresAt?.toISOString() ?? null,
    ]
  );

  return {
    receiptId,
    attestationId,
    payer: payer.toLowerCase(),
    paymentMethod,
    txHash: txHash ?? null,
    amountUsdMicros,
    hmac,
    paidAt,
    expiresAt: expiresAt?.toISOString() ?? null,
  };
}

// ── AccessReceipt 검증 ──────────────────────────────────────

/**
 * receiptId + HMAC + DB 검증 (payer 포함)
 */
export async function verifyReceipt(
  receiptId: string,
  attestationId: string,
  payer: string,
  hmac: string
): Promise<boolean> {
  // 1. HMAC 사전 검증 (빠른 필터)
  if (!verifyHmac(receiptId, attestationId, payer, hmac)) {
    return false;
  }

  // 2. DB 검증 (payer + attestation + 미만료)
  const result = await pool.query(
    `SELECT 1 FROM access_receipts
     WHERE receipt_id = $1
       AND attestation_id = $2
       AND payer = $3
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [receiptId, attestationId, payer.toLowerCase()]
  );
  return result.rows.length > 0;
}

/**
 * 특정 payer가 특정 attestation에 대한 유효한 receipt가 있는지 확인
 * (서버 내부 상태 조회 — X-ACCESS-RECEIPT 없을 때 사용)
 */
export async function hasValidReceipt(
  payer: string,
  attestationId: string
): Promise<AccessReceipt | null> {
  const result = await pool.query(
    `SELECT receipt_id, attestation_id, payer, payment_method, tx_hash,
            amount_usd_micros, hmac, paid_at, expires_at
     FROM access_receipts
     WHERE payer = $1
       AND attestation_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY paid_at DESC LIMIT 1`,
    [payer.toLowerCase(), attestationId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    receiptId: row.receipt_id,
    attestationId: row.attestation_id,
    payer: row.payer,
    paymentMethod: row.payment_method,
    txHash: row.tx_hash,
    amountUsdMicros: Number(row.amount_usd_micros),
    hmac: row.hmac,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
  };
}
