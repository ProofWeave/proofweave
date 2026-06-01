import { createHmac, timingSafeEqual } from "crypto";
import { uuidv7 } from "uuidv7";
import { pool } from "./db.js";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import type { AccessReceipt, ParsedReceipt } from "../types/payment.js";
import { EVM_TX_HASH_REGEX_SOURCE, isEvmTransactionHash } from "../utils/tx.js";

export interface ReceiptSettlementFields {
  creatorAddress: string;
  vaultAddress: string;
  vaultTxHash: string;
  vaultReceiptRef: string;
  claimableAmountUsdMicros: number;
}

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
  client?: PoolClient,
  settlement?: ReceiptSettlementFields
): Promise<AccessReceipt> {
  if (settlement && !isEvmTransactionHash(settlement.vaultTxHash)) {
    throw new Error("Receipt settlement requires a confirmed EVM vault tx hash");
  }

  const receiptId = uuidv7();
  const hmac = signReceipt(receiptId, attestationId, payer);
  const paidAt = new Date().toISOString();

  const queryFn = client ?? pool;
  await queryFn.query(
    `INSERT INTO access_receipts
       (receipt_id, attestation_id, payer, payment_method, tx_hash, amount_usd_micros,
        creator_address, vault_address, vault_tx_hash, vault_receipt_ref, claimable_amount_usd_micros,
        hmac, paid_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      receiptId,
      attestationId,
      payer.toLowerCase(),
      paymentMethod,
      txHash ?? null,
      amountUsdMicros,
      settlement?.creatorAddress.toLowerCase() ?? null,
      settlement?.vaultAddress.toLowerCase() ?? null,
      settlement?.vaultTxHash ?? txHash ?? null,
      settlement?.vaultReceiptRef ?? null,
      settlement?.claimableAmountUsdMicros ?? null,
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
    creatorAddress: settlement?.creatorAddress.toLowerCase() ?? null,
    vaultAddress: settlement?.vaultAddress.toLowerCase() ?? null,
    vaultTxHash: settlement?.vaultTxHash ?? txHash ?? null,
    vaultReceiptRef: settlement?.vaultReceiptRef ?? null,
    claimableAmountUsdMicros: settlement?.claimableAmountUsdMicros ?? null,
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
       AND vault_receipt_ref IS NOT NULL
       AND vault_receipt_ref <> ''
       AND vault_tx_hash ~ $4
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [receiptId, attestationId, payer.toLowerCase(), EVM_TX_HASH_REGEX_SOURCE]
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
            amount_usd_micros, creator_address, vault_address, vault_tx_hash,
            vault_receipt_ref, claimable_amount_usd_micros, hmac, paid_at, expires_at
     FROM access_receipts
     WHERE payer = $1
       AND attestation_id = $2
       AND vault_receipt_ref IS NOT NULL
       AND vault_receipt_ref <> ''
       AND vault_tx_hash ~ $3
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY paid_at DESC LIMIT 1`,
    [payer.toLowerCase(), attestationId, EVM_TX_HASH_REGEX_SOURCE]
  );

  if (result.rows.length === 0) return null;

  return mapReceiptRow(result.rows[0]);
}

export async function getReceiptById(receiptId: string): Promise<AccessReceipt | null> {
  const result = await pool.query(
    `SELECT receipt_id, attestation_id, payer, payment_method, tx_hash,
            amount_usd_micros, creator_address, vault_address, vault_tx_hash,
            vault_receipt_ref, claimable_amount_usd_micros, hmac, paid_at, expires_at
     FROM access_receipts
     WHERE receipt_id = $1
       AND vault_receipt_ref IS NOT NULL
       AND vault_receipt_ref <> ''
       AND vault_tx_hash ~ $2
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [receiptId, EVM_TX_HASH_REGEX_SOURCE]
  );

  if (result.rows.length === 0) return null;
  return mapReceiptRow(result.rows[0]);
}

function mapReceiptRow(row: {
  receipt_id: string;
  attestation_id: string;
  payer: string;
  payment_method: "smart-wallet";
  tx_hash: string | null;
  amount_usd_micros: string | number;
  creator_address: string | null;
  vault_address: string | null;
  vault_tx_hash: string | null;
  vault_receipt_ref: string | null;
  claimable_amount_usd_micros: string | number | null;
  hmac: string;
  paid_at: string;
  expires_at: string | null;
}): AccessReceipt {
  return {
    receiptId: row.receipt_id,
    attestationId: row.attestation_id,
    payer: row.payer,
    paymentMethod: row.payment_method,
    txHash: row.tx_hash,
    amountUsdMicros: Number(row.amount_usd_micros),
    creatorAddress: row.creator_address,
    vaultAddress: row.vault_address,
    vaultTxHash: row.vault_tx_hash,
    vaultReceiptRef: row.vault_receipt_ref,
    claimableAmountUsdMicros: row.claimable_amount_usd_micros === null
      ? null
      : Number(row.claimable_amount_usd_micros),
    hmac: row.hmac,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
  };
}
