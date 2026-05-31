import { pool } from "./db.js";
import type { PoolClient } from "pg";

export interface LedgerEntry {
  id?: string;
  attestationId: string;
  payer: string;
  amountUsdMicros: number;
  paymentMethod: string;
  txHash: string | null;
  receiptId: string | null;
  creatorAddress?: string | null;
  vaultAddress?: string | null;
  vaultTxHash?: string | null;
  vaultReceiptRef?: string | null;
  claimableAmountUsdMicros?: number | null;
  createdAt?: string;
}

/**
 * 결제 기록 저장
 * 모든 결제(smart-wallet)를 원장에 기록
 */
export async function recordPayment(
  entry: LedgerEntry,
  client?: PoolClient
): Promise<void> {
  const queryFn = client ?? pool;
  await queryFn.query(
    `INSERT INTO payments_ledger
       (attestation_id, payer, amount_usd_micros, payment_method, tx_hash, receipt_id,
        creator_address, vault_address, vault_tx_hash, vault_receipt_ref, claimable_amount_usd_micros)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.attestationId,
      entry.payer.toLowerCase(),
      entry.amountUsdMicros,
      entry.paymentMethod,
      entry.txHash,
      entry.receiptId,
      entry.creatorAddress?.toLowerCase() ?? null,
      entry.vaultAddress?.toLowerCase() ?? null,
      entry.vaultTxHash ?? entry.txHash,
      entry.vaultReceiptRef ?? null,
      entry.claimableAmountUsdMicros ?? null,
    ]
  );
}

export interface CreatorEarnings {
  /** SUM(payments_ledger.amount_usd_micros) — 평생 누적 수익 (string, BigInt-safe) */
  grossEarnedUsdMicros: string;
  /** SUM(claimable_amount_usd_micros) — reconciliation으로 vault에 입금 확인된 누적액 */
  reconciledDepositedUsdMicros: string;
  /** creator를 지정한 결제 건수 */
  paymentCount: number;
  /** 가장 최근 vault 정산 tx (없으면 null) */
  latestVaultTxHash: string | null;
  latestPaymentAt: string | null;
}

/**
 * creator(=pricing_policies.creator_address) 기준 수익 집계.
 * DB gross earned는 on-chain claimableBalance와 별개 값이다 (절대 합산/동일시 금지).
 * BIGINT 합계는 ::text로 직렬화해 JS Number 반올림을 피한다.
 */
export async function getCreatorEarnings(
  creatorAddress: string
): Promise<CreatorEarnings> {
  const creator = creatorAddress.toLowerCase();

  const agg = await pool.query(
    `SELECT
       COALESCE(SUM(amount_usd_micros), 0)::text          AS gross_earned_usd_micros,
       COALESCE(SUM(claimable_amount_usd_micros), 0)::text AS reconciled_deposited_usd_micros,
       COUNT(*)::int                                       AS payment_count
     FROM payments_ledger
     WHERE creator_address = $1`,
    [creator]
  );

  const latest = await pool.query(
    `SELECT vault_tx_hash, created_at
     FROM payments_ledger
     WHERE creator_address = $1 AND vault_tx_hash IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [creator]
  );

  const row = agg.rows[0];
  return {
    grossEarnedUsdMicros: row.gross_earned_usd_micros,
    reconciledDepositedUsdMicros: row.reconciled_deposited_usd_micros,
    paymentCount: row.payment_count,
    latestVaultTxHash: latest.rows[0]?.vault_tx_hash ?? null,
    latestPaymentAt: latest.rows[0]?.created_at ?? null,
  };
}

/**
 * 특정 지갑의 결제 이력 조회
 */
export async function getPaymentHistory(
  walletAddress: string
): Promise<LedgerEntry[]> {
  const result = await pool.query(
    `SELECT id, attestation_id, payer, amount_usd_micros, payment_method,
            tx_hash, receipt_id, creator_address, vault_address, vault_tx_hash,
            vault_receipt_ref, claimable_amount_usd_micros, created_at
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
    creatorAddress: row.creator_address,
    vaultAddress: row.vault_address,
    vaultTxHash: row.vault_tx_hash,
    vaultReceiptRef: row.vault_receipt_ref,
    claimableAmountUsdMicros: row.claimable_amount_usd_micros === null
      ? null
      : Number(row.claimable_amount_usd_micros),
    createdAt: row.created_at,
  }));
}
