-- ProofWeave dashboard mock attestations
-- 기간: 2026-04-26 ~ 2026-05-25
--
-- 사용법:
-- 1. Supabase Dashboard -> SQL Editor로 이동
-- 2. 이 파일 전체를 붙여넣고 Run
-- 3. 앱의 Dashboard를 새로고침
--
-- 재실행 가능:
-- - attestation_id가 pw_mock_dashboard_ 로 시작하는 row만 upsert합니다.
-- - 실제 온체인 verify 대상 데이터가 아니라 발표/캡처용 mock dashboard data입니다.
-- - Supabase SQL Editor에서 임시 테이블이 유지되지 않는 경우를 피하기 위해
--   단일 INSERT ... WITH 쿼리로 작성했습니다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE attestations ADD COLUMN IF NOT EXISTS ipfs_cid TEXT;
ALTER TABLE attestations ADD COLUMN IF NOT EXISTS encryption_salt TEXT;
ALTER TABLE attestations ADD COLUMN IF NOT EXISTS encryption_version INT DEFAULT 1;
ALTER TABLE attestations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE attestations ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE attestations ADD COLUMN IF NOT EXISTS metadata_status TEXT DEFAULT 'legacy';

WITH day_plan(day, n) AS (
  VALUES
    ('2026-04-26'::date, 2),
    ('2026-04-27'::date, 3),
    ('2026-04-28'::date, 4),
    ('2026-04-29'::date, 3),
    ('2026-04-30'::date, 5),
    ('2026-05-01'::date, 4),
    ('2026-05-02'::date, 6),
    ('2026-05-03'::date, 3),
    ('2026-05-04'::date, 4),
    ('2026-05-05'::date, 5),
    ('2026-05-06'::date, 3),
    ('2026-05-07'::date, 5),
    ('2026-05-08'::date, 6),
    ('2026-05-09'::date, 4),
    ('2026-05-10'::date, 3),
    ('2026-05-11'::date, 5),
    ('2026-05-12'::date, 4),
    ('2026-05-13'::date, 6),
    ('2026-05-14'::date, 5),
    ('2026-05-15'::date, 3),
    ('2026-05-16'::date, 4),
    ('2026-05-17'::date, 6),
    ('2026-05-18'::date, 5),
    ('2026-05-19'::date, 3),
    ('2026-05-20'::date, 4),
    ('2026-05-21'::date, 5),
    ('2026-05-22'::date, 6),
    ('2026-05-23'::date, 4),
    ('2026-05-24'::date, 3),
    ('2026-05-25'::date, 5)
),
domain_pool(idx, domain, domain_label) AS (
  VALUES
    (1,  'blockchain',     'Blockchain'),
    (2,  'defi',           'DeFi'),
    (3,  'smart_contract', 'Smart Contract'),
    (4,  'security',       'Security'),
    (5,  'legal',          'Legal'),
    (6,  'data_analysis',  'Data Analysis'),
    (7,  'infrastructure', 'Infra'),
    (8,  'cryptocurrency', 'Crypto'),
    (9,  'nft',            'NFT'),
    (10, 'dao',            'DAO'),
    (11, 'ai_ml',          'AI/ML'),
    (12, 'data_science',   'Data Science'),
    (13, 'web3',           'Web3'),
    (14, 'economics',      'Economics'),
    (15, 'education',      'Education'),
    (16, 'health',         'Health'),
    (17, 'science',        'Science'),
    (18, 'technology',     'Technology'),
    (19, 'general',        'General')
),
model_pool(idx, model) AS (
  VALUES
    (1, 'gpt-4o-mini'),
    (2, 'claude-3.5-sonnet'),
    (3, 'gemini-2.5-flash'),
    (4, 'gpt-4.1-mini'),
    (5, 'claude-code-harness'),
    (6, 'llama-3.1-70b')
),
expanded AS (
  SELECT
    dp.day,
    gs.seq,
    (((extract(day from dp.day)::int + gs.seq * 7) % 19) + 1) AS domain_idx,
    (((extract(day from dp.day)::int + gs.seq * 3) % 6) + 1) AS model_idx
  FROM day_plan dp
  CROSS JOIN LATERAL generate_series(1, dp.n) AS gs(seq)
),
prepared AS (
  SELECT
    'pw_mock_dashboard_' || to_char(e.day, 'YYYYMMDD') || '_' || lpad(e.seq::text, 2, '0') AS seed_key,
    e.day,
    e.seq,
    d.domain,
    d.domain_label,
    m.model,
    (
      e.day::timestamp
      + time '09:00'
      + (((extract(day from e.day)::int * 11 + e.seq * 73) % 480) * interval '1 minute')
    ) AT TIME ZONE 'Asia/Seoul' AS created_at
  FROM expanded e
  JOIN domain_pool d ON d.idx = e.domain_idx
  JOIN model_pool m ON m.idx = e.model_idx
),
mock_rows AS (
  SELECT
    seed_key AS attestation_id,
    '0x' || substr(md5(seed_key || ':content:a') || md5(seed_key || ':content:b'), 1, 64) AS content_hash,
    '0x' || substr(md5('creator:' || ((seq % 5) + 1)) || md5('creator:proofweave'), 1, 40) AS creator,
    model AS ai_model,
    'bafy' || substr(md5(seed_key || ':ipfs:a') || md5(seed_key || ':ipfs:b'), 1, 46) AS offchain_ref,
    8453200 + row_number() OVER (ORDER BY day, seq) AS block_number,
    created_at AS block_timestamp,
    '0x' || substr(md5(seed_key || ':tx:a') || md5(seed_key || ':tx:b'), 1, 64) AS tx_hash,
    'bafy' || substr(md5(seed_key || ':ipfs:a') || md5(seed_key || ':ipfs:b'), 1, 46) AS ipfs_cid,
    '0x' || substr(md5(seed_key || ':content:a') || md5(seed_key || ':content:b'), 1, 64) AS encryption_salt,
    2 AS encryption_version,
    jsonb_build_object(
      'title', format('%s AI 감사 샘플 %s-%s', domain_label, to_char(day, 'MM/DD'), seq),
      'domain', domain,
      'problemType',
        CASE (seq % 5)
          WHEN 0 THEN 'governance'
          WHEN 1 THEN 'provenance'
          WHEN 2 THEN 'compliance'
          WHEN 3 THEN 'risk_review'
          ELSE 'content_audit'
        END,
      'keywords', jsonb_build_array(domain, 'mock', 'audit', 'provenance'),
      'abstract', format('%s 영역의 기관 내부 AI 생성 결과물을 감사 추적하기 위한 발표용 mock 데이터입니다.', domain_label),
      'language', 'ko',
      'format', 'text',
      'sizeStats', jsonb_build_object(
        'chars', 420 + seq * 37,
        'tokens', 105 + seq * 9
      ),
      'policyTags', jsonb_build_array('mock', 'dashboard', 'internal-audit'),
      'detectedPII', false,
      'mock', true
    ) AS metadata,
    ARRAY[domain, 'mock', 'audit', 'provenance']::TEXT[] AS keywords,
    'ready' AS metadata_status,
    created_at
  FROM prepared
)

INSERT INTO attestations (
  attestation_id,
  content_hash,
  creator,
  ai_model,
  offchain_ref,
  block_number,
  block_timestamp,
  tx_hash,
  ipfs_cid,
  encryption_salt,
  encryption_version,
  metadata,
  keywords,
  metadata_status,
  created_at
)
SELECT
  attestation_id,
  content_hash,
  creator,
  ai_model,
  offchain_ref,
  block_number,
  block_timestamp,
  tx_hash,
  ipfs_cid,
  encryption_salt,
  encryption_version,
  metadata,
  keywords,
  metadata_status,
  created_at
FROM mock_rows
ON CONFLICT (attestation_id) DO UPDATE SET
  content_hash = EXCLUDED.content_hash,
  creator = EXCLUDED.creator,
  ai_model = EXCLUDED.ai_model,
  offchain_ref = EXCLUDED.offchain_ref,
  block_number = EXCLUDED.block_number,
  block_timestamp = EXCLUDED.block_timestamp,
  tx_hash = EXCLUDED.tx_hash,
  ipfs_cid = EXCLUDED.ipfs_cid,
  encryption_salt = EXCLUDED.encryption_salt,
  encryption_version = EXCLUDED.encryption_version,
  metadata = EXCLUDED.metadata,
  keywords = EXCLUDED.keywords,
  metadata_status = EXCLUDED.metadata_status,
  created_at = EXCLUDED.created_at;

SELECT
  COUNT(*) AS mock_rows_in_attestations,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM attestations
WHERE attestation_id LIKE 'pw_mock_dashboard_%';
