import { pool } from "../services/db.js";

const SCHEMA = `
-- ============================================================
--  ProofWeave DB Schema (Phase 2-1 + 2-2 + 2-3)
-- ============================================================

-- pgcrypto extension (UUID 생성용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- attestations 캐시 (Phase 2-6 인덱서가 채움)
CREATE TABLE IF NOT EXISTS attestations (
  attestation_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  creator TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  offchain_ref TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attestations_creator ON attestations(creator);
CREATE INDEX IF NOT EXISTS idx_attestations_content_hash ON attestations(content_hash);

-- API Keys (Phase 2-2)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- 소비된 서명 해시 — 리플레이 방지 (Phase 2-2)
CREATE TABLE IF NOT EXISTS consumed_signatures (
  sig_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  consumed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Access Receipts (Phase 2-3)
CREATE TABLE IF NOT EXISTS access_receipts (
  receipt_id UUID PRIMARY KEY,
  attestation_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('x402', 'delegated')),
  tx_hash TEXT,
  amount_usd_micros BIGINT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

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

-- 결제 원장 (Phase 2-3)
CREATE TABLE IF NOT EXISTS payments_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  amount_usd_micros BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  tx_hash TEXT,
  receipt_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_payer ON payments_ledger(payer);
CREATE INDEX IF NOT EXISTS idx_ledger_attestation ON payments_ledger(attestation_id);
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
