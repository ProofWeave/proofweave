import { randomUUID } from "crypto";
import { pool } from "./db.js";

export interface AccessReceipt {
  receiptId: string;
  attestationId: string;
  payer: string;
  paymentMethod: "x402" | "delegated";
  txHash: string | null;
  amountUsdMicros: number;
  paidAt: string;
  expiresAt: string | null;
}

/**
 * AccessReceipt 발급
 * 결제 완료 후 호출 → DB 저장 + receipt 반환
 */
export async function issueReceipt(
  attestationId: string,
  payer: string,
  paymentMethod: "x402" | "delegated",
  amountUsdMicros: number,
  txHash?: string,
  expiresAt?: Date
): Promise<AccessReceipt> {
  const receiptId = randomUUID(); // UUID v4 (v7은 Phase 2-4에서)
  const paidAt = new Date().toISOString();

  await pool.query(
    `INSERT INTO access_receipts
       (receipt_id, attestation_id, payer, payment_method, tx_hash, amount_usd_micros, paid_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      receiptId,
      attestationId,
      payer.toLowerCase(),
      paymentMethod,
      txHash ?? null,
      amountUsdMicros,
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
    paidAt,
    expiresAt: expiresAt?.toISOString() ?? null,
  };
}

/**
 * AccessReceipt 검증
 * receipt가 존재 + 미만료 + attestation 일치 → true
 */
export async function verifyReceipt(
  receiptId: string,
  attestationId: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM access_receipts
     WHERE receipt_id = $1
       AND attestation_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [receiptId, attestationId]
  );
  return result.rows.length > 0;
}

/**
 * 특정 payer가 특정 attestation에 대한 유효한 receipt가 있는지 확인
 */
export async function hasValidReceipt(
  payer: string,
  attestationId: string
): Promise<AccessReceipt | null> {
  const result = await pool.query(
    `SELECT receipt_id, attestation_id, payer, payment_method, tx_hash,
            amount_usd_micros, paid_at, expires_at
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
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
  };
}
