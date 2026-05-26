# ProofWeave 온체인 배포 상태 및 실환경 E2E 검증 안내서

이 문서는 ProofWeave 프로젝트의 온체인(Base Sepolia) 및 로컬 E2E 결제/복구 시스템의 최종 상태를 진단하고, 실환경 검증을 위해 사용자가 터미널에서 순차적으로 구동해야 할 명령어들을 정리한 실전 런북(Runbook)입니다.

---

## 1. 🔍 온체인 배포 상태 최종 진단 (Status: DONE)

*   **프록시(Proxy) 및 Vault 주소**: `0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E`
*   **신규 구현체(Implementation) 주소**: `0x11c86A6f5110727Bf9A8a19aE4F09C24141438C5`
*   **배포 성공 트랜잭션**: [0xfa8abf4bccd6a9e563afb6579fd6ddd0087de1f11f1c7a5bed624f73efa8e07d](https://sepolia.basescan.org/tx/0xfa8abf4bccd6a9e563afb6579fd6ddd0087de1f11f1c7a5bed624f73efa8e07d)
*   **상태 요약**: 이미 온체인(Base Sepolia) 프록시에 UUPS 업그레이드가 완료되었으며, `initializeVault` 함수를 통해 `reinitializer(2)` 단계의 USDC 토큰 연동 초기화가 **트랜잭션 성공(status: 0x1)** 처리되어 완료되어 있습니다. 
*   **조치**: 컨트랙트 주소는 전혀 바뀌지 않았으며, `.env`의 설정이 정확합니다. **추가적인 온체인 배포 행위가 필요 없습니다.**

---

## 2. 🚀 E2E 통합 실환경 검증 수행 가이드 (단계별 명령어)

사용자는 터미널에서 다음 스텝에 따라 실환경 기능 연동 상태를 확인하실 수 있습니다.

### 1단계: Supabase 원격 데이터베이스 스키마 마이그레이션 적용
원격 Supabase DB의 SQL Editor에 다음 쿼리를 복사하여 붙여넣고 실행해, 결제 정산 및 평판 Sybil Guard 테이블 제약 조건을 주입합니다.

```sql
-- 1. access_receipts 및 payments_ledger에 정산 컬럼 추가
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

-- 2. 중복 처리 방지를 위한 고신뢰도 Partial Unique Index 추가 (CONCURRENTLY 제외로 트랜잭션 에러 우회)
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

-- 3. 평판 테이블 생성 및 동일 주소 중복 평판 작성 방지 Unique index 추가
CREATE TABLE IF NOT EXISTS artifact_reputation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attestation_id VARCHAR(255) NOT NULL,
    account_address VARCHAR(42) NOT NULL,
    receipt_id UUID REFERENCES access_receipts(id) ON DELETE SET NULL,
    rating VARCHAR(20) NOT NULL CHECK (rating IN ('useful', 'not_useful')),
    note TEXT,
    artifact_hash VARCHAR(66),
    trust_tier VARCHAR(20) NOT NULL DEFAULT 'unverified',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_unique_account_attestation 
ON artifact_reputation_logs (attestation_id, account_address);
```

### 2단계: API 백엔드 서버 구동 및 화해 스케줄러 기동
API 백엔드를 빌드하고 실행시킵니다. 서버 구동 시, 이번에 새롭게 개발된 주기적 **온체인 결제 화해 스케줄러(Reconciliation Scheduler)**가 함께 백그라운드로 작동하기 시작합니다.

```bash
# 1. API 백엔드 빌드 및 실행
npm --prefix api run build
npm --prefix api start
```

### 3단계: CDP Smart Wallet 실거래 스모크 테스트 실행 (E2E)
실제 Base Sepolia에서 스마트 지갑을 이용해 USDC를 approve하고 Vault에 2-call UserOperation으로 입금하여 온체인 실결제가 성공적으로 마이닝되고 영수증이 매핑되는지 E2E로 확인합니다.

```bash
# 1. 환경 변수 로드
export $(cat .env | grep -v '^#' | sed 's/#.*$//' | xargs)

# 2. CDP Smart Wallet E2E 결제 스모크 테스트 구동
npx tsx api/scripts/smoke-cdp-vault-payment.ts --network base-sepolia
```

### 4단계: 백엔드 수동 화해(Reconciliation) 강제 트리거 테스트
네트워크 순단 등으로 결제 API 응답이 끊겼을 때, 온체인 데이터를 쿼리해 결제를 백그라운드에서 강제 복구해주는 관리자 API 작동을 검증합니다.

```bash
# 0번 블록부터 현재 블록까지 모든 VaultDeposited 이벤트를 훑고, DB 누락분을 소급 발급
curl -X POST http://localhost:3001/admin/reconcile \
  -H "Content-Type: application/json" \
  -d '{"fromBlock": 0}'
```

### 5단계: 공식 토큰 절감 부트스트랩 벤치마크 테스트
100개 쿼리 데이터셋을 통해 Paired LLM 비용 절감 리포트 및 95% 신뢰구간 분석을 구동합니다.

```bash
# 벤치마크 테스트 수행
npm --prefix experiments/token-efficiency run benchmark
```

### 6단계: CLI 하네스 진단 도구 검증
로컬 설정 파일 권한(`0600`) 및 API key, RPC 밸런스 정합성을 `doctor` 진단기로 확인합니다.

```bash
# 1. CLI 빌드
npm --prefix cli run build

# 2. doctor 검사 실행
node cli/dist/index.js doctor
```
