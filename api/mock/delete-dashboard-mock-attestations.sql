-- ProofWeave dashboard mock data cleanup
-- Supabase Dashboard -> SQL Editor에서 실행

DELETE FROM pricing_policies
WHERE attestation_id LIKE 'pw_mock_dashboard_%';

DELETE FROM attestations
WHERE attestation_id LIKE 'pw_mock_dashboard_%';
