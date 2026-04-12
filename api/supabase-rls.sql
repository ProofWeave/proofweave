-- ============================================================
--  ProofWeave RLS Policies
--  Supabase Dashboard → SQL Editor에서 실행
--
--  전략: 모든 테이블에 RLS ON + anon/authenticated 직접 접근 차단
--  API 서버는 service_role(postgres) 연결이므로 RLS 우회됨
-- ============================================================

-- 1. RLS 활성화 (모든 테이블)
ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumed_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_quotes ENABLE ROW LEVEL SECURITY;

-- 2. 기본 정책: anon/authenticated 유저에게 NO ACCESS
--    (정책이 없으면 RLS가 켜진 상태에서 모든 접근 차단됨)
--    service_role(postgres)는 RLS를 자동 우회하므로 API 서버는 정상 동작

-- 3. 읽기 전용 공개: attestations의 공개 필드만 anon에게 허용 (선택사항)
--    Explorer 페이지에서 Supabase JS로 직접 조회하고 싶을 때만 활성화
--    현재는 API 서버를 통해서만 접근하므로 주석 처리

-- CREATE POLICY "attestations_public_read" ON attestations
--   FOR SELECT TO anon, authenticated
--   USING (true);

-- 확인: 모든 테이블이 RLS 활성화되었는지
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'attestations', 'api_keys', 'consumed_signatures',
    'access_receipts', 'pricing_policies', 'payments_ledger', 'payment_quotes'
  );
