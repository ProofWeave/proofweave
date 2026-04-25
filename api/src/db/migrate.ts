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

-- T5: Envelope Encryption 버전 추적 (1=HKDF legacy, 2=Envelope DEK)
DO $$ BEGIN
  ALTER TABLE attestations ADD COLUMN encryption_version INT DEFAULT 1;
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

-- ============================================================
--  T3: 메타데이터 매니페스트 시스템
-- ============================================================

-- attestations 테이블에 메타데이터 컬럼 추가
DO $$ BEGIN
  ALTER TABLE attestations ADD COLUMN metadata JSONB DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE attestations ADD COLUMN keywords TEXT[] DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE attestations ADD COLUMN metadata_status TEXT DEFAULT 'legacy';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- GIN 인덱스: 키워드 배열 검색 + JSONB 메타데이터 검색
CREATE INDEX IF NOT EXISTS idx_attestations_keywords
  ON attestations USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_attestations_metadata
  ON attestations USING GIN (metadata jsonb_path_ops);

-- ============================================================
--  Analytics: real LLM usage and one-time data reuse metrics
-- ============================================================

CREATE TABLE IF NOT EXISTS llm_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  model TEXT NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_owner_created_at
  ON llm_usage_events(owner, created_at DESC);

CREATE TABLE IF NOT EXISTS attestation_token_baselines (
  attestation_id TEXT PRIMARY KEY REFERENCES attestations(attestation_id) ON DELETE CASCADE,
  llm_usage_event_id UUID UNIQUE REFERENCES llm_usage_events(id) ON DELETE SET NULL,
  owner TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attestation_token_baselines_owner
  ON attestation_token_baselines(owner);

CREATE TABLE IF NOT EXISTS data_reuse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id TEXT NOT NULL REFERENCES attestations(attestation_id) ON DELETE CASCADE,
  consumer TEXT NOT NULL,
  receipt_id UUID REFERENCES access_receipts(receipt_id) ON DELETE SET NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('paid', 'free', 'receipt')),
  metered BOOLEAN NOT NULL DEFAULT false,
  avoided_input_tokens BIGINT NOT NULL DEFAULT 0,
  avoided_output_tokens BIGINT NOT NULL DEFAULT 0,
  avoided_cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  actual_llm_cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consumer, attestation_id)
);

CREATE INDEX IF NOT EXISTS idx_data_reuse_consumer_created_at
  ON data_reuse_events(consumer, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_reuse_attestation
  ON data_reuse_events(attestation_id);
	`;

/**
 * 서버 시작 시 import하여 호출 가능한 마이그레이션 함수
 * pool.end()를 호출하지 않아 서버 커넥션 풀이 유지됨
 */
export async function runMigrations(): Promise<void> {
  console.log("🔄 Running database migration...");
  try {
    await pool.query(SCHEMA);
    console.log("✅ Migration complete — schema up to date");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    throw err;
  }
}

// 스크립트 직접 실행 시 (npx tsx src/db/migrate.ts)
const isDirectRun = process.argv[1]?.includes("migrate");
if (isDirectRun) {
  runMigrations()
    .then(() => pool.end())
    .catch(() => process.exit(1));
}
