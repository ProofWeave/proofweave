import { pool } from "./db.js";

export interface LedgerEntry {
  id?: string;
  attestationId: string;
  payer: string;
  amountUsdMicros: number;
  paymentMethod: string;
  txHash: string | null;
  receiptId: string | null;
  createdAt?: string;
}

/**
 * 결제 기록 저장
 * 모든 결제(x402, delegated)를 원장에 기록
 */
export async function recordPayment(entry: LedgerEntry): Promise<void> {
  await pool.query(
    `INSERT INTO payments_ledger
       (attestation_id, payer, amount_usd_micros, payment_method, tx_hash, receipt_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.attestationId,
      entry.payer.toLowerCase(),
      entry.amountUsdMicros,
      entry.paymentMethod,
      entry.txHash,
      entry.receiptId,
    ]
  );
}

/**
 * 특정 지갑의 결제 이력 조회
 */
export async function getPaymentHistory(
  walletAddress: string
): Promise<LedgerEntry[]> {
  const result = await pool.query(
    `SELECT id, attestation_id, payer, amount_usd_micros, payment_method,
            tx_hash, receipt_id, created_at
     FROM payments_ledger
     WHERE payer = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [walletAddress.toLowerCase()]
  );

  return result.rows.map((row) => ({
    id: row.id,
    attestationId: row.attestation_id,
    payer: row.payer,
    amountUsdMicros: Number(row.amount_usd_micros),
    paymentMethod: row.payment_method,
    txHash: row.tx_hash,
    receiptId: row.receipt_id,
    createdAt: row.created_at,
  }));
}
