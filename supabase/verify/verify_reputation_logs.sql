-- Reputation log verification for Supabase SQL Editor.

SELECT
  'artifact_reputation_logs table' AS check_name,
  CASE WHEN COUNT(*) = 1 THEN 'ok' ELSE 'missing' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'artifact_reputation_logs';

SELECT
  'artifact_reputation_logs columns' AS check_name,
  CASE WHEN COUNT(*) = 10 THEN 'ok' ELSE 'missing' END AS status,
  ARRAY_AGG(column_name ORDER BY column_name) AS observed_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'artifact_reputation_logs'
  AND column_name IN (
    'id',
    'attestation_id',
    'account_address',
    'receipt_id',
    'rating',
    'note',
    'artifact_hash',
    'trust_tier',
    'created_at',
    'updated_at'
  );

SELECT
  indexname AS check_name,
  'ok' AS status,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_reputation_unique_account_attestation',
    'idx_reputation_attestation_trust',
    'idx_reputation_receipt'
  )
ORDER BY indexname;

DO $$
DECLARE
  duplicate_blocked BOOLEAN := FALSE;
BEGIN
  DELETE FROM artifact_reputation_logs
  WHERE attestation_id = 'verify_reputation_attestation'
    AND account_address = '0x1234567890123456789012345678901234567890';

  INSERT INTO artifact_reputation_logs (attestation_id, account_address, rating)
  VALUES ('verify_reputation_attestation', '0x1234567890123456789012345678901234567890', 'useful');

  BEGIN
    INSERT INTO artifact_reputation_logs (attestation_id, account_address, rating)
    VALUES ('verify_reputation_attestation', '0x1234567890123456789012345678901234567890', 'not_useful');
  EXCEPTION WHEN unique_violation THEN
    duplicate_blocked := TRUE;
  END;

  DELETE FROM artifact_reputation_logs
  WHERE attestation_id = 'verify_reputation_attestation'
    AND account_address = '0x1234567890123456789012345678901234567890';

  IF NOT duplicate_blocked THEN
    RAISE EXCEPTION 'duplicate reputation insert was not blocked';
  END IF;
END $$;

SELECT 'reputation duplicate guard' AS check_name, 'ok' AS status;
