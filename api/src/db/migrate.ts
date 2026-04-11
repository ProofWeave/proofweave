import { pool } from "../services/db.js";

const SCHEMA = `
-- ============================================================
--  ProofWeave DB Schema (Phase 2-1)
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

-- API Keys (Phase 2-2에서 활성화)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Access Receipts (Phase 2-4에서 활성화)
-- Note: gen_random_uuid()는 v4. UUID v7 시간순 정렬이 필요하면
-- 애플리케이션 레벨에서 생성하여 삽입 (Phase 2-4에서 구현)
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
`;

async function migrate() {
  console.log("🔄 Running database migration...");
  try {
    await pool.query(SCHEMA);
    console.log("✅ Migration complete — 3 tables created");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
