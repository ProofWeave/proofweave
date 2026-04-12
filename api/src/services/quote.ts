import { randomBytes } from "crypto";
import { pool } from "./db.js";
import type { PoolClient } from "pg";
import type { PaymentQuote } from "../types/payment.js";

const QUOTE_TTL_SECONDS = 300; // 5분

/**
 * 결제 견적(quoteId) 발급
 * - 402 응답 시 발급
 * - 5분 TTL
 * - 같은 payer + attestation + 금액에 대해 미사용 quote가 있으면 재활용
 */
export async function issueQuote(
  attestationId: string,
  payer: string,
  amountUsdMicros: number
): Promise<PaymentQuote> {
  // 기존 미사용 + 미만료 + 동일 금액 quote 재활용
  const existing = await pool.query(
    `SELECT quote_id, attestation_id, payer, amount_usd_micros,
            created_at, expires_at, consumed_at
     FROM payment_quotes
     WHERE payer = $1
       AND attestation_id = $2
       AND amount_usd_micros = $3
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [payer.toLowerCase(), attestationId, amountUsdMicros]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      quoteId: row.quote_id,
      attestationId: row.attestation_id,
      payer: row.payer,
      amountUsdMicros: Number(row.amount_usd_micros),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: null,
    };
  }

  // 새 quote 생성
  const quoteId = `q_${randomBytes(16).toString("hex")}`;
  const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000);

  await pool.query(
    `INSERT INTO payment_quotes (quote_id, attestation_id, payer, amount_usd_micros, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [quoteId, attestationId, payer.toLowerCase(), amountUsdMicros, expiresAt.toISOString()]
  );

  return {
    quoteId,
    attestationId,
    payer: payer.toLowerCase(),
    amountUsdMicros,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    consumedAt: null,
  };
}

/**
 * quoteId 검증 + attestationId 바인딩 확인
 */
export async function verifyQuote(
  quoteId: string,
  payer: string,
  attestationId?: string
): Promise<PaymentQuote | null> {
  let query = `SELECT quote_id, attestation_id, payer, amount_usd_micros,
            created_at, expires_at, consumed_at
     FROM payment_quotes
     WHERE quote_id = $1 AND payer = $2`;
  const params: (string | undefined)[] = [quoteId, payer.toLowerCase()];

  if (attestationId) {
    query += ` AND attestation_id = $3`;
    params.push(attestationId);
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    quoteId: row.quote_id,
    attestationId: row.attestation_id,
    payer: row.payer,
    amountUsdMicros: Number(row.amount_usd_micros),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

/**
 * quoteId 소비 처리 (트랜잭션 내에서 호출 가능)
 * SELECT FOR UPDATE로 race condition 방지
 * @returns 소비 성공 여부 — false면 이미 소비되었거나 만료됨
 */
export async function consumeQuote(
  quoteId: string,
  client?: PoolClient
): Promise<boolean> {
  const queryFn = client ?? pool;

  // SELECT FOR UPDATE로 row 잠금 → 동시 요청 직렬화
  const lock = await queryFn.query(
    `SELECT 1 FROM payment_quotes
     WHERE quote_id = $1 AND consumed_at IS NULL AND expires_at > NOW()
     FOR UPDATE`,
    [quoteId]
  );

  if (lock.rows.length === 0) return false;

  const result = await queryFn.query(
    `UPDATE payment_quotes SET consumed_at = NOW()
     WHERE quote_id = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
    [quoteId]
  );
  return (result.rowCount ?? 0) > 0;
}
