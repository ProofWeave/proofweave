-- ProofWeave vault settlement columns and idempotency guards.
-- Safe to run more than once in Supabase SQL Editor.

ALTER TABLE IF EXISTS access_receipts
  ADD COLUMN IF NOT EXISTS creator_address TEXT,
  ADD COLUMN IF NOT EXISTS vault_address TEXT,
  ADD COLUMN IF NOT EXISTS vault_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS vault_receipt_ref TEXT,
  ADD COLUMN IF NOT EXISTS claimable_amount_usd_micros BIGINT;

ALTER TABLE IF EXISTS payments_ledger
  ADD COLUMN IF NOT EXISTS creator_address TEXT,
  ADD COLUMN IF NOT EXISTS vault_address TEXT,
  ADD COLUMN IF NOT EXISTS vault_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS vault_receipt_ref TEXT,
  ADD COLUMN IF NOT EXISTS claimable_amount_usd_micros BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_vault_ref_partial
  ON access_receipts (vault_receipt_ref)
  WHERE vault_receipt_ref IS NOT NULL AND vault_receipt_ref <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_ledger_vault_ref_partial
  ON payments_ledger (vault_receipt_ref)
  WHERE vault_receipt_ref IS NOT NULL AND vault_receipt_ref <> '';

CREATE INDEX IF NOT EXISTS idx_receipts_vault_tx_hash
  ON access_receipts (vault_tx_hash)
  WHERE vault_tx_hash IS NOT NULL AND vault_tx_hash <> '';

CREATE INDEX IF NOT EXISTS idx_payments_ledger_vault_tx_hash
  ON payments_ledger (vault_tx_hash)
  WHERE vault_tx_hash IS NOT NULL AND vault_tx_hash <> '';
