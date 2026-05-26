-- Vault settlement verification for Supabase SQL Editor.

SELECT
  'access_receipts vault columns' AS check_name,
  CASE WHEN COUNT(*) = 5 THEN 'ok' ELSE 'missing' END AS status,
  ARRAY_AGG(column_name ORDER BY column_name) AS observed_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'access_receipts'
  AND column_name IN (
    'creator_address',
    'vault_address',
    'vault_tx_hash',
    'vault_receipt_ref',
    'claimable_amount_usd_micros'
  );

SELECT
  'payments_ledger vault columns' AS check_name,
  CASE WHEN COUNT(*) = 5 THEN 'ok' ELSE 'missing' END AS status,
  ARRAY_AGG(column_name ORDER BY column_name) AS observed_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payments_ledger'
  AND column_name IN (
    'creator_address',
    'vault_address',
    'vault_tx_hash',
    'vault_receipt_ref',
    'claimable_amount_usd_micros'
  );

SELECT
  indexname AS check_name,
  'ok' AS status,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_receipts_vault_ref_partial',
    'idx_payments_ledger_vault_ref_partial',
    'idx_receipts_vault_tx_hash',
    'idx_payments_ledger_vault_tx_hash'
  )
ORDER BY indexname;
