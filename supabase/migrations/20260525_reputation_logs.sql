-- ProofWeave account-based artifact reputation logs.
-- V1 reputation is internal account-based logging, not an EIP-8004 implementation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS artifact_reputation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id TEXT NOT NULL,
  account_address TEXT NOT NULL,
  receipt_id UUID REFERENCES access_receipts(receipt_id) ON DELETE SET NULL,
  rating TEXT NOT NULL CHECK (rating IN ('useful', 'not_useful')),
  note TEXT,
  artifact_hash TEXT,
  trust_tier TEXT NOT NULL DEFAULT 'unverified' CHECK (trust_tier IN ('verified', 'unverified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_unique_account_attestation
  ON artifact_reputation_logs (attestation_id, account_address);

CREATE INDEX IF NOT EXISTS idx_reputation_attestation_trust
  ON artifact_reputation_logs (attestation_id, trust_tier);

CREATE INDEX IF NOT EXISTS idx_reputation_receipt
  ON artifact_reputation_logs (receipt_id)
  WHERE receipt_id IS NOT NULL;
