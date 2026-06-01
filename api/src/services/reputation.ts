import { pool } from "./db.js";
import { EVM_TX_HASH_REGEX_SOURCE } from "../utils/tx.js";

export type ReputationRating = "useful" | "not_useful";
export type ReputationTrustTier = "verified" | "unverified";

export interface ReputationLog {
  id: string;
  attestationId: string;
  accountAddress: string;
  receiptId: string | null;
  rating: ReputationRating;
  note: string | null;
  artifactHash: string | null;
  trustTier: ReputationTrustTier;
  createdAt: string;
}

export interface ReputationSummary {
  attestationId: string;
  verifiedUsefulRatio: number | null;
  verifiedSampleSize: number;
  unverifiedUsefulRatio: number | null;
  unverifiedSampleSize: number;
  earlyEvaluationStage: boolean;
}

export class ReputationError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_ACCOUNT"
      | "INVALID_RATING"
      | "SELF_RATING"
      | "UNPURCHASED"
      | "DUPLICATE",
    message: string
  ) {
    super(message);
  }
}

const MIN_VERIFIED_SAMPLE_SIZE = 5;

export async function submitReputation(params: {
  attestationId: string;
  accountAddress: string;
  receiptPayers?: string[];
  rating: ReputationRating;
  note?: string | null;
  artifactHash?: string | null;
}): Promise<ReputationLog> {
  const accountAddress = normalizeAddress(params.accountAddress);
  if (!accountAddress) {
    throw new ReputationError("INVALID_ACCOUNT", "account address must be a 40-byte hex address");
  }
  if (params.rating !== "useful" && params.rating !== "not_useful") {
    throw new ReputationError("INVALID_RATING", "rating must be useful or not_useful");
  }

  const attestation = await pool.query(
    `SELECT creator FROM attestations WHERE attestation_id = $1`,
    [params.attestationId]
  );
  if (attestation.rows.length === 0) {
    throw new ReputationError("NOT_FOUND", "attestation not found");
  }

  const creator = String(attestation.rows[0].creator).toLowerCase();
  if (creator === accountAddress) {
    throw new ReputationError("SELF_RATING", "creator cannot rate their own attestation");
  }

  const price = await pool.query(
    `SELECT price_usd_micros FROM pricing_policies WHERE attestation_id = $1`,
    [params.attestationId]
  );
  const priceUsdMicros = price.rows.length > 0
    ? Number(price.rows[0].price_usd_micros)
    : 0;

  let receiptId: string | null = null;
  let trustTier: ReputationTrustTier = "unverified";
  if (priceUsdMicros > 0) {
    const receiptPayers = normalizeReceiptPayers(params.receiptPayers, accountAddress);
    const receipt = await pool.query(
      `SELECT receipt_id
       FROM access_receipts
       WHERE attestation_id = $1
         AND payer = ANY($2::text[])
         AND vault_receipt_ref IS NOT NULL
         AND vault_receipt_ref <> ''
         AND vault_tx_hash ~ $3
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY paid_at DESC
       LIMIT 1`,
      [params.attestationId, receiptPayers, EVM_TX_HASH_REGEX_SOURCE]
    );
    if (receipt.rows.length === 0) {
      throw new ReputationError("UNPURCHASED", "paid artifact reputation requires a vault-backed receipt");
    }
    receiptId = String(receipt.rows[0].receipt_id);
    trustTier = "verified";
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO artifact_reputation_logs
         (attestation_id, account_address, receipt_id, rating, note, artifact_hash, trust_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, attestation_id, account_address, receipt_id, rating, note, artifact_hash, trust_tier, created_at`,
      [
        params.attestationId,
        accountAddress,
        receiptId,
        params.rating,
        params.note ?? null,
        params.artifactHash ?? null,
        trustTier,
      ]
    );
    return mapReputationLog(inserted.rows[0]);
  } catch (err: unknown) {
    if (errorCode(err) === "23505") {
      throw new ReputationError("DUPLICATE", "account already submitted reputation for this attestation");
    }
    throw err;
  }
}

export async function getReputationSummary(attestationId: string): Promise<ReputationSummary> {
  const result = await pool.query(
    `SELECT trust_tier, rating, COUNT(*)::int AS count
     FROM artifact_reputation_logs
     WHERE attestation_id = $1
     GROUP BY trust_tier, rating`,
    [attestationId]
  );

  let verifiedUseful = 0;
  let verifiedTotal = 0;
  let unverifiedUseful = 0;
  let unverifiedTotal = 0;

  for (const row of result.rows) {
    const count = Number(row.count);
    if (row.trust_tier === "verified") {
      verifiedTotal += count;
      if (row.rating === "useful") verifiedUseful += count;
    } else {
      unverifiedTotal += count;
      if (row.rating === "useful") unverifiedUseful += count;
    }
  }

  return {
    attestationId,
    verifiedUsefulRatio: ratioOrNull(verifiedUseful, verifiedTotal),
    verifiedSampleSize: verifiedTotal,
    unverifiedUsefulRatio: ratioOrNull(unverifiedUseful, unverifiedTotal),
    unverifiedSampleSize: unverifiedTotal,
    earlyEvaluationStage: verifiedTotal < MIN_VERIFIED_SAMPLE_SIZE,
  };
}

function normalizeAddress(value: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value.toLowerCase();
}

function normalizeReceiptPayers(values: string[] | undefined, fallback: string): string[] {
  const payers = new Set<string>([fallback.toLowerCase()]);
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed) payers.add(trimmed.toLowerCase());
  }
  return [...payers];
}

function ratioOrNull(useful: number, total: number): number | null {
  if (total === 0) return null;
  return useful / total;
}

function mapReputationLog(row: {
  id: string;
  attestation_id: string;
  account_address: string;
  receipt_id: string | null;
  rating: ReputationRating;
  note: string | null;
  artifact_hash: string | null;
  trust_tier: ReputationTrustTier;
  created_at: string;
}): ReputationLog {
  return {
    id: row.id,
    attestationId: row.attestation_id,
    accountAddress: row.account_address,
    receiptId: row.receipt_id,
    rating: row.rating,
    note: row.note,
    artifactHash: row.artifact_hash,
    trustTier: row.trust_tier,
    createdAt: row.created_at,
  };
}

function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
