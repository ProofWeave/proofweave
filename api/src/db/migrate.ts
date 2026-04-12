import { pool } from "../services/db.js";

const SCHEMA = `
-- ============================================================
--  ProofWeave DB Schema (Phase 2-1 + 2-2 + 2-3 + 2-4)
-- ============================================================

-- pgcrypto extension (UUID 생성용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- attestations (Phase 2-1 생성 + 2-5 확장)
CREATE TABLE IF NOT EXISTS attestations (
  attestation_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  creator TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  offchain_ref TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  ipfs_cid TEXT,
  encryption_salt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 2-5: 새 컬럼 추가 (이미 있으면 무시)
DO $$ BEGIN
  ALTER TABLE attestations ADD COLUMN ipfs_cid TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE attestations ADD COLUMN encryption_salt TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_attestations_creator ON attestations(creator);
CREATE INDEX IF NOT EXISTS idx_attestations_content_hash ON attestations(content_hash);
CREATE INDEX IF NOT EXISTS idx_attestations_ai_model ON attestations(ai_model);
CREATE INDEX IF NOT EXISTS idx_attestations_created_at ON attestations(created_at);

-- API Keys (Phase 2-2 + 2-4: smart_wallet_address 추가)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  smart_wallet_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Phase 2-4: smart_wallet_address 컬럼 추가 (이미 있으면 무시)
DO $$ BEGIN
  ALTER TABLE api_keys ADD COLUMN smart_wallet_address TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 지갑당 활성 API key 최대 1개 보장 (동시 register 레이스 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_active_wallet
  ON api_keys (wallet_address) WHERE revoked_at IS NULL;

-- 소비된 서명 해시 — 리플레이 방지 (Phase 2-2)
CREATE TABLE IF NOT EXISTS consumed_signatures (
  sig_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  consumed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Access Receipts (Phase 2-3 + 2-4: hmac 추가)
CREATE TABLE IF NOT EXISTS access_receipts (
  receipt_id UUID PRIMARY KEY,
  attestation_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('smart-wallet')),
  tx_hash TEXT,
  amount_usd_micros BIGINT NOT NULL,
  hmac TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Phase 2-4: hmac 컬럼 추가 (이미 있으면 무시)
DO $$ BEGIN
  ALTER TABLE access_receipts ADD COLUMN hmac TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_receipts_payer ON access_receipts(payer);
CREATE INDEX IF NOT EXISTS idx_receipts_attestation ON access_receipts(attestation_id);

-- 가격 정책 (Phase 2-3)
CREATE TABLE IF NOT EXISTS pricing_policies (
  attestation_id TEXT PRIMARY KEY,
  creator_address TEXT NOT NULL,
  price_usd_micros BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USDC',
  network TEXT NOT NULL DEFAULT 'eip155:84532',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 결제 원장 (Phase 2-3 + 2-4: FK 추가)
CREATE TABLE IF NOT EXISTS payments_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  amount_usd_micros BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  tx_hash TEXT,
  receipt_id UUID REFERENCES access_receipts(receipt_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_payer ON payments_ledger(payer);
CREATE INDEX IF NOT EXISTS idx_ledger_attestation ON payments_ledger(attestation_id);
-- txHash 기반 idempotency 검색용
CREATE INDEX IF NOT EXISTS idx_payments_ledger_tx_hash
  ON payments_ledger (tx_hash) WHERE tx_hash IS NOT NULL;

-- 결제 견적 — 중복 결제 방지 (Phase 2-4)
CREATE TABLE IF NOT EXISTS payment_quotes (
  quote_id TEXT PRIMARY KEY,
  attestation_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  amount_usd_micros BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quotes_payer ON payment_quotes(payer);
`;

async function migrate() {
  console.log("🔄 Running database migration...");
  try {
    await pool.query(SCHEMA);
    console.log("✅ Migration complete — 6 tables created");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
