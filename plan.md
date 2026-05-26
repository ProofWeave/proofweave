# ProofWeave 구현 계획

## 0. 현재 상태 점검 결과

이 문서는 2026-05-22 현재 저장소 상태를 기준으로, 구현 완료까지 필요한 작업을 정리한다.

### 0.1 Vault 직접 정산 배포 여부

**판정: 아직 아님.**

현재 코드에는 vault 직접 정산 로직이 들어가 있다.

- `src/AttestationRegistry.sol`: `initializeVault`, `depositForAttestation`, `claimCreatorBalance`, `claimableBalance`, `isReceiptCredited`
- `api/src/middleware/x402Gate.ts`: 유료 접근 경로가 `depositUsdcToVaultFromSmartWallet`를 호출
- `api/src/services/wallet.ts`: CDP UserOperation에 `USDC.approve(...)`와 `depositForAttestation(...)` 두 call을 넣음
- `api/src/db/migrate.ts`: receipt/ledger에 vault 대조용 컬럼 추가

하지만 배포 완료 증거는 없다.

- `broadcast/Deploy.s.sol/84532/run-latest.json`은 2026-04-24 최초 Base Sepolia 배포 로그다.
- vault 변경은 2026-05-15 이후 작업이라 기존 broadcast 로그와 시점이 맞지 않는다.
- `script/Deploy.s.sol`은 여전히 신규 proxy 배포만 수행하고, 기존 UUPS proxy upgrade + `initializeVault(USDC)` 호출 스크립트가 없다.
- API config는 별도 `VAULT_ADDRESS` 없이 `PROXY_ADDRESS`를 vault 주소로 재사용한다. same-proxy 방식이면 proxy 주소는 그대로지만, implementation slot upgrade와 `initializeVault` tx가 있어야 한다.

따라서 현재 상태는 다음과 같이 정리한다.

> Vault 직접 정산 코드는 구현되어 있고 로컬 테스트는 가능하지만, Base Sepolia 기존 proxy에 대한 upgrade, vault initializer 호출, 배포 주소/tx 증거 고정은 아직 필요하다.

### 0.2 CDP UserOperation 변경 후 실제 tx 검증 여부

**판정: 아직 아님.**

현재 검증된 것은 mock/API 단위 테스트와 코드 경로다.

- `npm --prefix api test -- x402Gate.test.ts`: 통과, 6 tests
- `api/src/__tests__/x402Gate.test.ts`는 `depositUsdcToVaultFromSmartWallet`를 mock으로 처리한다.
- `api/src/__tests__/e2e-payment.ts`는 API 서버/Keychain/CDP 환경을 요구하지만, 현재 vault deposit 이후 실제 tx hash, Vault event, receipt, ledger까지 확인하는 실환경 스모크 증거는 없다.
- `api/src/services/wallet.ts`에는 CDP env가 없으면 `dev-vault-tx-*`를 반환하는 개발 모드가 있다. 이 값은 실제 온체인 tx가 아니다.

따라서 현재 상태는 다음과 같이 정리한다.

> UserOperation payload 구성은 구현되어 있고 mock test는 통과했지만, 실제 Base Sepolia에서 approve + deposit UserOperation이 성공했다는 tx/event 증거는 아직 없다.

### 0.3 Claude Code 하네스 구현과 동작 확인

**판정: 부분 구현됨. 드라이런 동작은 가능하지만, 전체 buy/install 실환경 흐름은 아직 아님.**

현재 확인된 것:

- `npm --prefix cli run build`: 통과
- `node cli/dist/index.js --help`: 명령 목록 출력 확인
- `node cli/dist/index.js install --target claude-code --scope project --dry-run`: Claude Code 명령형 hook 설정 출력 확인
- `node cli/dist/index.js publish cli/README.md --dry-run --price-usd-micros 100000 --usage-event-id sample-event`: `POST /attest` payload 정규화 확인
- `proofweave hook user-prompt-submit`, `proofweave hook pre-tool-use`: fail-open JSON 출력 확인

아직 부족한 것:

- temp HOME 기반 install/uninstall round-trip test
- 실제 `~/.claude/settings.json` 또는 project `.claude/settings.json`에 설치 후 Claude Code가 hook을 호출하는 통합 확인
- `auth -> search -> preview -> buy -> install-artifact -> stats` 전체 흐름 확인
- 스테이징 API와 연결된 실제 receipt 저장 확인
- `proofweave doctor` 없음

따라서 현재 상태는 다음과 같이 정리한다.

> Claude Code 하네스는 CLI/드라이런 수준으로 구현되어 있고 hook 명령 형태는 확인됐다. 다만 실제 Claude Code 세션과 스테이징 paid artifact buy/install까지 이어지는 통합 검증은 남아 있다.

## 1. 목표

목표는 구현 단위별로 실제 동작하는 기능, 검증 가능한 배포 상태, 재현 가능한 통합환경을 만드는 것이다.

최종 구현 흐름은 다음을 목표로 한다.

```text
Creator가 artifact를 발행
-> listing에 가격 설정
-> buyer smart wallet이 CDP UserOperation으로 결제
-> UserOperation이 USDC approve + AttestationRegistry.depositForAttestation 호출
-> API가 vault deposit 이후에만 X-Access-Receipt 발급
-> buyer가 ProofWeave CLI 하네스로 artifact 수신/설치
-> creator가 Base Sepolia에서 claimable balance 확인 및 claim 실행
-> user가 계정당 1회 reputation log 남김
-> 고정된 공식 벤치마크 환경에서 토큰 절감 보고서 생성
```

## 2. 범위 규칙

### 반드시 구현할 것

- 기존 same-proxy vault 경로 완성
- UUPS upgrade 또는 신규 스테이징 배포를 tx 증거와 함께 완료
- `initializeVault(Base Sepolia USDC)` 호출 및 기록
- API config가 vault-capable proxy를 참조하도록 정리
- CDP 실결제 스모크로 실제 UserOperation transaction 검증
- Supabase migration 및 verification SQL 파일 작성
- Web UI에서 payment, receipt, claimable balance, claim action, user reputation log 노출
- Claude Code 하네스 설치, publish 드라이런, 스테이징 buy/install 흐름 검증
- 토큰 절감 측정을 고정된 벤치마크 하네스와 공식 보고서 형식으로 정리
- 로컬/스테이징 스모크를 위한 통합환경과 실행 안내서 작성

### 구현 완료로 간주하지 말 것

- Audit 전 mainnet readiness 주장 금지
- Provider token usage와 품질 통과 여부가 측정되지 않은 상태에서 "90% savings" 또는 과금 감소 주장 금지
- EIP-8004 구현 주장 금지. V1 reputation은 ProofWeave 내부 account-based logging으로 제한
- `dev-vault-tx-*` 또는 mock 처리된 CDP output만 있는 상태에서 실결제 완료 주장 금지
- broadcast/tx hash, proxy implementation check, API env 증거 없이 deployed 주장 금지

## 3. 작업 계획

### 1단계: Vault 배포와 주소 참조값 확정

**목적:** 기존 Base Sepolia 프록시에 대한 UUPS 업그레이드를 안전하게 완수하고, 스토리지 슬롯 충돌 없이 `initializeVault(USDC)` 설정을 완료한다.

작업:

1. **UUPS Proxy Upgrade 스크립트 작성 (`script/UpgradeVault.s.sol`)**:
   - `AttestationRegistry` 신규 구현체(implementation) 배포 코드 작성.
   - 기존 프록시(`PROXY_ADDRESS`)의 `upgradeToAndCall` 인터페이스 호출.
   - `initializeVault(USDC_ADDRESS)`를 `upgradeToAndCall` 내부의 `data` 패러미터(ABI encoded callback)로 묶어 단일 원자적(atomic) 트랜잭션으로 실행하도록 설계.
   - `reinitializer(2)` 등을 적용하여 중복 초기화를 엄격하게 차단.

2. **스토리지 레이아웃 슬롯 충돌 검증 (Storage Layout Collision Check)**:
   - 업그레이드 전/후 컨트랙트의 스토리지 레이아웃을 빌드 아티팩트 레벨에서 정밀 비교.
   - 아래 명령을 통해 구 버번과 신 버전의 변수 슬롯 오프셋을 추출 및 수동 분석:
     ```bash
     forge inspect src/AttestationRegistry.sol:AttestationRegistryOld storageLayout > old_layout.json
     forge inspect src/AttestationRegistry.sol:AttestationRegistry storageLayout > new_layout.json
     # 신규 vault 관련 변수(vault-initialized, balances, usdc 주소 등)가 기존 변수 슬롯(0~5번 슬롯)을 침범하지 않고 
     # 뒤에 올바르게 append 되었는지 바이트 단위 정밀 대조 검증.
     ```

3. **설정 관리 분리 (Configuration Strictness)**:
   - `api/src/config/env.ts` 및 `.env.example`에 `VAULT_ADDRESS` 환경 변수를 명시적으로 추가하여 프록시 주소(`PROXY_ADDRESS`)와 개념적으로 철저히 격리.
   - 비록 staging/production에서 same-proxy 아키텍처(`VAULT_ADDRESS = PROXY_ADDRESS`)를 활용하더라도 코드 내부에서는 `vaultInstance`와 `registryInstance`를 독립된 인스턴스로 바인딩하여 캡슐화 수준 유지.

4. **API ABI 동기화 및 주소 연결**:
   - `api/src/contracts/abi.ts` 내에 `initializeVault`, `claimCreatorBalance`, `depositForAttestation` 등의 온체인 ABI 인터페이스 정의 주입 확인.
   - `api/src/contracts/attestationRegistry.ts`가 registry와 vault 주소를 명확하게 반환하도록 매퍼 로직 수정.

5. **Base Sepolia 실환경 배포 및 온체인 상태 쿼리**:
   - 업그레이드 트랜잭션 실행 후 `broadcast/UpgradeVault.s.sol/84532/run-latest.json` 저장.
   - ERC-1967 표준에 따라 프록시의 implementation 슬롯(`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`)을 직접 `cast storage`로 쿼리하여 업그레이드 여부 검증.

완료 기준:

- `cast storage <PROXY_ADDRESS> 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` 결과가 신규 implementation 주소와 정확히 일치.
- `cast call <PROXY_ADDRESS> "usdc()(address)"`가 Base Sepolia USDC 주소(`0x0349865a5d3905f47a61cf5325854897f1fbc7c8` 등)를 올바르게 반환.
- `cast call <PROXY_ADDRESS> "claimableBalance(address)(uint256)" <TEST_CREATOR_ADDRESS>` 쿼리 성공 및 0 또는 유효 잔액 확인.
- `initializeVault` 재호출이 reinitializer version 소진으로 인해 revert를 발생시키며 중복 실행이 차단됨을 확인.
- 업그레이드 로그 및 스토리지 대조 리포트를 `docs/evidence/vault-deploy/` 하위에 영구 보존.

검증 명령:

```bash
forge test --offline --match-contract Vault
npm --prefix api run build
forge script script/UpgradeVault.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
```

### 2단계: CDP UserOperation 단위 검증 및 실환경 검증

**목적:** CDP Smart Wallet 기반의 ERC-4337 UserOperation 구조가 오동작 없이 원자적으로 트랜잭션을 실행하고, 비상 상황(Gas stuck 등)에 견고하게 대응함을 검증한다.

작업:

1. **결정적 UserOperation Payload 단위 테스트 강화**:
   - CDP 가스 스폰서십(Paymaster) 동작 하에, 유저 오퍼레이션의 `callData` 파이프라인 검증.
   - 단일 UserOperation 내에 포함된 Call List가 아래의 원자적 순서를 완벽히 따르는지 모크 및 상태 단언(assert) 추가:
     - **Call 1**: `USDC.approve(VAULT_ADDRESS, amount)`
     - **Call 2**: `VAULT_ADDRESS.depositForAttestation(attestationId, creator, amount, receiptRef)`
   - 유료 접근 자금이 `operatorAccount.address` 등 허용되지 않은 외부 주소로 절대 이탈하지 않고, 컨트랙트 내 Vault 영역으로 직행하는지 static analysis 기법으로 이중 검증.

2. **Gas Stuck & Tx 실패 복구 시나리오 보완**:
   - Base Sepolia의 급격한 가스비 변동으로 UserOperation이 멤풀(mempool)에 머무르는 현상 대응.
   - 트랜잭션 stuck 시, 기존 nonce를 기반으로 최대 가스 가격(`maxFeePerGas`, `maxPriorityFeePerGas`)을 20% 이상 상향 조정하여 재전송(replacement)을 실행하는 가스 가격 재조정 오프셋 정책 마련.
   - `api/src/services/vaultReconciliation.ts`를 신설하여, 유저의 온체인 입금(deposit)은 성공했으나 API 서버 이슈나 네트워크 타임아웃으로 인해 DB 레코드 생성 또는 Receipt 반환에 실패했을 때, 백그라운드 스케줄러가 온체인 이벤트를 추적하여 DB 데이터를 자동 동기화(Reconciliation)하고 유저 권한을 소급 적용해 주는 복구 로직 구현.

3. **실환경 스모크 스크립트 작성 (`api/scripts/smoke-cdp-vault-payment.ts`)**:
   - 실제 Base Sepolia 네트워크에 배포된 스마트 컨트랙트 및 활성화된 CDP Smart Wallet 계정을 사용하여 종단 간(E2E) 실결제 흐름 실행.
   - 서명 수행 -> UserOperation 제출 -> RPC 트래킹 -> `X-Access-Receipt` 헤더 캡처 -> DB 정합성(Ledger 및 Receipt) 확인.

4. **온체인 이벤트 및 멱등성(Idempotency) 검증**:
   - Viem Public Client를 통해 컨트랙트가 방출한 `VaultDeposited(receiptRef, attestationId, creator, payer, amount)` 이벤트를 구독하여 DB의 `vault_receipt_ref`와 정확히 결합하는지 검증.
   - 동일한 `receiptRef`로 결제 API를 중복 호출할 경우 온체인의 `isReceiptCredited(receiptRef) == true` 상태에 의해 스마트 월렛 수준에서 중복 `depositForAttestation`이 원천 차단(revert)되는지 멱등성 검증 테스트 케이스 수행.

완료 기준:

- Base Sepolia 상에서 유효한 2-call 스마트 월렛 트랜잭션이 성공적으로 마이닝된 실제 Tx Hash 확보.
- 가스 stuck 및 타임아웃 상황에서 재시도 메커니즘을 통해 정상 마이닝 완료됨을 입증.
- `access_receipts.vault_receipt_ref`와 `payments_ledger.vault_receipt_ref`가 동일한 온체인 이벤트를 레퍼런스하여 외래키 수준의 무결성 충족.
- 중복 결제 시도 시 온체인 revert 및 API에서 `409 Conflict` (또는 `Already Credited`) 에러를 일관되게 반환.

검증 명령:

```bash
npm --prefix api test -- x402Gate.test.ts
npm --prefix api run build
npx tsx api/scripts/smoke-cdp-vault-payment.ts --network base-sepolia
```

### 3단계: Supabase migration 및 verification SQL

**목적:** 실제 Supabase 프로덕션/스테이징 대시보드나 SQL Editor에서 즉시 에러 없이 실행 가능한 멱등성(Idempotent) 있는 SQL 마이그레이션 및 상태 검증용 SQL을 설계하고 적용한다.

작업:

1. **SQL 파일 아티팩트 설계 및 물리 DDL 명세**:
   - `supabase/migrations/20260522_vault_settlement.sql`: 결제 테이블 변경용 스크립트.
     - `access_receipts` 테이블에 `vault_receipt_ref` (VARCHAR, NULL 허용으로 하위 호환성 유지) 컬럼 추가.
     - `payments_ledger` 테이블에 `vault_receipt_ref` (VARCHAR) 컬럼 추가 및 온체인 연동을 위한 unique 제약 조건 부여.
     - **이중 결제 및 멱등성 보장을 위한 Unique Partial Index 생성**:
       ```sql
       -- access_receipts 테이블에 vault_receipt_ref가 NULL이 아닌 경우에만 유일성을 보장하도록 설정
       CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_vault_ref_partial 
       ON access_receipts (vault_receipt_ref) 
       WHERE vault_receipt_ref IS NOT NULL AND vault_receipt_ref <> '';
       ```
   - `supabase/migrations/20260522_reputation_logs.sql`: 평판 시스템 전용 테이블 DDL.
     ```sql
     CREATE TABLE IF NOT EXISTS artifact_reputation_logs (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         attestation_id VARCHAR(255) NOT NULL,
         account_address VARCHAR(42) NOT NULL,
         receipt_id UUID REFERENCES access_receipts(id) ON DELETE SET NULL,
         rating VARCHAR(20) NOT NULL CHECK (rating IN ('useful', 'not_useful')),
         note TEXT,
         artifact_hash VARCHAR(66),
         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
     );

     -- 동일 계정이 하나의 attestation에 대해 오직 1회의 평판만 작성 가능하도록 엄격한 유니크 제약 생성
     CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_unique_account_attestation 
     ON artifact_reputation_logs (attestation_id, account_address);
     ```

2. **하위 호환성(Nullable Compatibility) 및 데이터 이그레이션**:
   - 기존의 무료/오프체인 receipt들의 비즈니스 연속성을 해치지 않기 위해 신규 컬럼은 기본적으로 `NULL` 가능하도록 처리.
   - 단, `vault` 결제 경로를 타는 신규 레코드의 경우 데이터 정합성 수호(Constraint)를 위해 애플리케이션 서비스 레이어(`receipt.ts`, `ledger.ts`)에서 반드시 `vault_receipt_ref`가 전달되도록 비즈니스 검증(Validation) 추가.

3. **Supabase SQL Editor용 쿼리 검증 스크립트 작성**:
   - `supabase/verify/verify_vault_settlement.sql` 및 `verify_reputation_logs.sql`을 작성하여 마이그레이션 후 DB 헬스 체크 수행.
     ```sql
     -- 테이블 구조 및 인덱스 정상 주입 확인 쿼리
     SELECT 
         table_name, column_name, data_type, is_nullable
     FROM 
         information_schema.columns
     WHERE 
         (table_name = 'artifact_reputation_logs') 
         OR (table_name = 'access_receipts' AND column_name = 'vault_receipt_ref');
         
     -- Unique constraint 유효성 시뮬레이션
     BEGIN;
     INSERT INTO artifact_reputation_logs (attestation_id, account_address, rating) 
     VALUES ('att_test', '0x1234567890123456789012345678901234567890', 'useful');
     
     -- 중복 인서트 시 유니크 인덱스로 인해 에러가 나는지 롤백 트랜잭션 내에서 자가 테스트
     -- 기대치: unique_violation (SQLSTATE 23505) 에러 발생
     INSERT INTO artifact_reputation_logs (attestation_id, account_address, rating) 
     VALUES ('att_test', '0x1234567890123456789012345678901234567890', 'not_useful');
     ROLLBACK;
     ```

4. **원격 Supabase 배포 및 실행 가이드 보완**:
   - Supabase CLI를 통한 `supabase db push` 방법 혹은 CLI가 준비되지 않은 환경에서 Supabase 대시보드 내 SQL Editor에 복사-붙여넣기하여 순차적으로 에러 없이 실행하는 체크리스트 가이드 작성.

완료 기준:

- 검증 SQL 실행 결과, 모든 타겟 테이블 구조와 인덱스가 `ok` 상태로 리포트됨.
- 신규 마이그레이션 스크립트를 2회 이상 연속으로 실행하더라도 `IF NOT EXISTS` 가드로 인해 에러가 발생하지 않음.
- 기존 DB 내 무료 결제 영수증 및 서비스 기동 중단 없이 무중단(Zero-downtime) 마이그레이션이 완료됨을 로컬 통합 테스트에서 실증.
- 실행에 성공한 쿼리 로그 및 Supabase Editor 트랜스크립트 증적을 `docs/evidence/supabase/` 디렉토리에 백업 보관.

### 4단계: Web UI 변경

**목적:** 사용자가 스마트 컨트랙트 및 API 서버와 실시간으로 연동되는 결제, 정산(Claim), 평판 작성 플로우를 웹 상에서 자연스럽고 직관적으로 조작하고 그 복구 과정을 추적할 수 있도록 완성도 높은 반응형 UI를 제공한다.

작업:

1. **결제 상태 머신(Payment State Machine) UI 구현**:
   - 스마트 월렛 및 CDP 결제 처리를 위해 6가지 구체적인 상태를 갖는 State Machine을 Web Client UI에 도입:
     `Idle` -> `Initiated` -> `WalletApproved` -> `UserOpSigned` -> `MempoolPending` -> `OnchainConfirmed` -> `APIReconciled`
   - 각 상태 변환을 부드러운 스피너와 프로그레스 게이지, 트랜잭션 해시 링크(`Basescan`)를 통해 유저에게 실시간 브리핑.
   - 스마트 월렛 서명 단계 또는 멤풀 대기 상태에서 브라우저가 강제 종료되거나 유저가 이탈한 경우, 컴포넌트 마운트 시 로컬 스토리지에 남아있는 `pending_tx_ref`를 백그라운드에서 조회하여 자동으로 결제 완료 상태를 복구(Reconcile)해 주는 "Recovering Payment..." 배너 UI 설계.

2. **Creator Settlement & Claim 대시보드 보완**:
   - Creator 계정으로 접속 시 온체인 Vault에서 실시간 인출 가능한 `Claimable USDC Balance` 잔액 표시.
   - USDC 토큰 잔액 조회 API와 Metamask/RainbowKit 지갑 직접 연결을 통해 Web3 Direct-Write를 보조하는 Claim 폼 설계 (대상 주소 및 인출 금액 지정 가능).
   - Claim 트랜잭션이 전송(broadcast)되면, 트랜잭션이 최종 마이닝될 때까지 "인출 대기 중..." 실시간 토스트 메시지 및 이력 노출.

3. **Reputation Submission UI 컴포넌트 설계**:
   - Artifact를 구매 완료한 사용자가 손쉽게 평점/평가를 남길 수 있도록 평가 카드 양식 구성.
   - 사용자가 이미 해당 Artifact에 대한 평판을 작성한 적이 있다면 폼을 비활성화하고 "이미 평가를 등록하셨습니다." 안내 문구와 작성 이력 바인딩.

완료 기준:

- `npm --prefix web run build` 에러 없이 무결성 빌드 완료.
- 스마트 월렛 트랜잭션 서명 지연 및 멤풀 펜딩 상황에서 UI가 얼지 않고(non-blocking) 적절한 진행 상태 피드백을 출력함을 입증.
- 복구 배너 동작 테스트: 결제 마이닝 도중 페이지를 새로고침(F5)해도 백그라운드 Reconciliation API 조회를 거쳐 정상적으로 "구매 완료" 화면 및 Artifact 다운로드 버튼으로 복귀함을 실증.

### 5단계: 계정 기반 데이터 평판 시스템 (Reputation Sybil Guard)

**목적:** EIP-8004 표준을 활용하는 복잡도 대신 ProofWeave 오프체인 가용성을 극대화하되, 시빌 공격(Sybil Attack) 및 봇 어뷰징을 통한 가짜 평판 조작을 완벽하게 필터링할 수 있는 안전한 평판 검증 메커니즘을 구축한다.

작업:

1. **Reputation Sybil Guard 제출 자격 철저 격리**:
   - 단순히 "인증된 계정당 1회"의 느슨한 규칙을 폐기하고, 다음의 엄격한 자격 증명(Verification Criteria)을 API 엔드포인트(`POST /attestations/:id/reputation`)에 구현:
     - **Paid Artifact의 경우**: 사용자가 전달한 계정 주소(`account_address`)가 해당 `attestation_id`에 대해 성공적으로 결제 완료된 유효 영수증(`access_receipts` 내에 `vault_receipt_ref`가 매핑된 상태)을 반드시 소유하고 있어야 함. 영수증이 없는 경우 평판 기록 요청을 `403 Forbidden (Unpurchased Artifact)`으로 거부.
     - **Free/Public Artifact의 경우**: 시빌 공격 완화를 위해, 평판을 작성하는 계정의 최소 가스 활동 이력(예: 온체인 트랜잭션 횟수(Nonce)가 1 이상이거나 일정 자량 이상의 가스 소지 확인)을 Web3 API로 검증하여 평판의 신뢰도를 분류.
     - **Creator 자가 평가 원천 차단**: 해당 Artifact를 생성/발행한 Creator 계정 주소와 평판 작성 계정이 일치하는 경우, API가 이를 감지하여 `400 Bad Request (Self-Rating Prohibited)`로 기각.

2. **물리 테이블 설계 및 DB 제약 조건 적용**:
   - `artifact_reputation_logs` 테이블의 Unique Constraint 및 Foreign Key 무결성을 적극 활용하여 DB 수준에서 이중 입력을 무력화 (3단계의 마이그레이션 SQL과 연계).

3. **평판 집계 API 엔진 다각화 (`GET /attestations/:id/reputation`)**:
   - 단순 합산이 아닌 신뢰 기반 가중치 집계 반환:
     - **Verified Aggregate**: 영수증 결제 검증이 완료된 사용자들의 유용한 평가 비율 (`verified_useful_ratio`, `verified_sample_size`).
     - **Unverified Aggregate**: 무료/일반 접근 유저들의 평가 비율 (`unverified_useful_ratio`).
     - **신뢰구간 미달 가드**: 총 평판 표본 수(Verified sample size)가 최소 임계치(예: 5개)에 도달하기 전까지는 웹 UI 랭킹 알고리즘에 가중치를 주지 않고 "Early Evaluation Stage" 배지를 표출.

완료 기준:

- 결제 영수증이 없는 외부 악성 공격 계정의 평판 제출 요청이 API 단에서 완벽하게 차단됨을 테스트 코드로 입증.
- Creator 자가 제출 차단 및 동일 구매 계정의 중복 제출 차단 정상 작동 확인.
- Verified 집계와 Unverified 집계가 물리 쿼리 상에서 철저하게 격리 및 분류되어 계산됨을 보증.

### 6단계: 공식 토큰 절감 환경 (Rigorous Token Savings Benchmark)

**목적:** 단순 텍스트 길이 추정에 기반한 부정확한 절감 선전을 배제하고, 수학적으로 검증 가능하며 데이터셋 규모를 비약적으로 확장한 고신뢰도 공식 실험 벤치마크 하네스를 고정한다.

작업:

1. **실험 데이터셋 대규모 확장 및 Fixture 설계**:
   - 기존의 10개 문항 샘플을 넘어, 실제 프로덕션 및 엔지니어링 케이스를 대표하는 **최소 100개 이상의 정교한 실전 쿼리(Real-world Queries)** 및 **100개 이상의 Executable Artifact**로 데이터셋 구성 다각화.
   - 각 데이터셋은 API Migration, Smart Contract Gas optimization, On-chain data analysis, Regulatory compliance 등 다양한 도메인별로 20% 균등 분할 배정하여 편향성 배제.

2. **수학적으로 검증 가능한 절감 공식 명시화**:
   - **Canonical Text Tokens (CTT) Reduction ($R_{ctt}$)**:
     $$R_{ctt, i} = 1 - \frac{CTT(\text{query}_i + \text{retrieved\_artifact}_i)}{CTT(\text{query}_i + \text{candidate\_pool\_all})}$$
     *(여기서 CTT는 `tiktoken.get_encoding("o200k_base")`를 사용하여 BPE 인코딩된 토큰 수의 엄밀한 계산 결과값임)*
   - **Net Cost Savings ($S_i$) 계산 공식**:
     $$S_i = \text{Cost}_{\text{raw}, i} - \text{Cost}_{\text{proofweave}, i}$$
     $$\text{Cost}_{\text{raw}, i} = (IT_{\text{raw}, i} \cdot P_{\text{in}} + OT_{\text{raw}, i} \cdot P_{\text{out}})$$
     $$\text{Cost}_{\text{proofweave}, i} = (IT_{\text{pw}, i} \cdot P_{\text{in}} + OT_{\text{pw}, i} \cdot P_{\text{out}}) + \text{Price}_{\text{data}, i}$$
     *(여기서 $IT$는 Input Tokens, $OT$는 Output Tokens, $P$는 LLM 제공사의 API 요율, $\text{Price}_{\text{data}}$는 데이터 마켓플레이스의 상품 책정 가격임. 데이터 구매 비용을 명시적으로 차감하여 경제적 순이익을 입증함)*
   - **Quality-Adjusted Net Savings (QAS)**:
     $$\text{QAS}_i = S_i \cdot \text{QualityPass}_i$$
     *($\text{QualityPass}_i \in [0, 1]$ 는 도메인 전문가의 평가 루브릭 또는 LLM-as-a-judge 통과율 지표로, 할루시네이션이 발생하거나 요구 키워드를 누락 시 0점 처리하여 품질이 담보되지 않은 의미 없는 비용 절감을 페널티 처리함)*

3. **Bootstrap 95% Confidence Interval (CI) 통계 분석 프로세스**:
   - 단순 평균값(Mean)은 극단적인 아웃라이어 쿼리에 의해 쉽게 왜곡되므로, 비모수적(Non-parametric) 통계 기법인 부트스트랩을 적용:
     - 100개 이상의 표본에서 복원 추출(Replacement Sampling)을 10,000회 반복 수행하여 모의 표본 분포 생성.
     - 각 모의 분포의 Median 값을 기준으로 하위 2.5%($P_{2.5}$)와 상위 97.5%($P_{97.5}$) 백분위점을 측정하여 **95% 신뢰구간** 도출 및 최종 리포트 문서에 표기.

4. **Multi-LLM Paired Run 설정 구체화**:
   - 동일 질문 세트에 대해 OpenAI GPT-4o (`o200k_base`), Anthropic Claude 3.5 Sonnet (`cl100k_base` 변형), Google Gemini 1.5 Pro 등 서로 다른 인코딩 사전을 지닌 핵심 LLM 엔진 그룹을 대상으로 Paired Execution 파이프라인 구동.
   - 각 LLM의 실제 API 응답 메타데이터(`usage.prompt_tokens`, `usage.completion_tokens`)를 백엔드에 직접 가로채어 CTT 추정치가 아닌 실제 과금 토큰 감소율 추이 대조 분석.

완료 기준:

- 100개 쿼리 데이터셋을 활용하여 `npm --prefix experiments/token-efficiency run benchmark` 명령을 실행했을 때 통계적 부트스트랩 신뢰구간이 명시된 `summary.md` 보고서가 자동 생성됨.
- 실측 비용 요율표(`PriceUsdMicros`)와 데이터 상품 단가가 결합되어 품질 페널티가 계산된 QAS 지표가 0 이상으로 양수를 유지함을 확인.
- 보고서 본문 내에 실제 빌링 메타데이터가 존재하지 않고 로컬 proxy 수치만 사용한 구역은 명시적으로 `[Local BPE Token Proxy Estimation Mode]` 배지를 의무 표기하도록 컴파일러 린트 추가.


### 7단계: Claude Code 하네스 전체 검증 및 보안 강화

**목적:** CLI 도구가 로컬 세션 및 유저의 민감한 에이전트 환경 정보에 직접 개입하므로, 엄격한 훅 권한 확인 및 예기치 못한 시스템 오류 발생 시의 Fail-Safe 메커니즘을 견고히 설계한다.

작업:

1. **CLI 로컬 보안 감사 및 권한 격리**:
   - `~/.claude/settings.json` 파싱 시 발생할 수 있는 권한 에러 예방을 위해 설정 파일의 POSIX 권한 체크 모듈 구현:
     - 설정 파일 읽기/쓰기 시점에 해당 디렉터리 권한을 `0600` (Owner Read/Write Only)으로 강제 유지하고, 소유권 불일치 시 실행 거부.
   - 악성 훅 주입(Malicious Hook Injection) 공격 방지: 설치 시 기존에 존재하던 설정 파일 구조의 무결성 체크섬(SHA-256)을 백업하고, 삭제 시 정확히 백업 상태로의 클린 원복(Rollback)을 보장하는 격리형 install/uninstall 스위트 개발.

2. **강력한 진단 도구 (`proofweave doctor`) 고도화**:
   - CLI 버전, 로컬 권한(Permissions), API 서버 접근 가능성(Reachability), JWT 세션 상태(Auth), 스마트 월렛 잔액 상태(Balance), RPC 가스 상태 체크.
   - 각 검사 항목에 대해 에러 플래그와 상세 조치 가이드(Troubleshooting Tips)를 출력하며, 단 하나의 항목이라도 실패할 시 Non-Zero Exit Code를 반환하여 CI/CD 파이프라인과의 즉각 연동 가능 설계.

3. **장애 극복용 Fail-Open 정책 및 투명 로깅**:
   - ProofWeave API 서버가 다운되거나 결제 승인 지연 등의 치명적인 이슈 발생 시, 유저의 로컬 개발 세션(Claude Code 실행)을 강제로 멈추지(blocking) 않고 바이패스시키는 **투명 Fail-Open** 모드 고도화.
   - 다만, 유저가 인지할 수 있도록 표준 에러(stderr) 버퍼에 은은한 옐로우 톤 경고 배너 및 "Bypassing ProofWeave due to network anomaly..." 진단 로그를 기록하여 세션 투명성 제공.

완료 기준:

- `proofweave doctor` 실행 결과가 모두 초록색 `[PASS]`를 띄우거나, 에러 발생 시 명확히 조치 방법을 터미널에 가이드함.
- 로컬 권한 에러 상태에서 CLI가 시스템 크래시를 내지 않고 우아한 에러 메시지와 함께 비정상 실행을 안전 차단.
- 강제 API 단절 테스트 진행 시에도 Claude Code 세션이 락업 없이 즉시 바이패스 구동됨을 실증.

### 8단계: 통합환경 및 로컬 가스 시뮬레이션

**목적:** 복잡도가 높은 로컬 및 분산 스테이징 테스트 환경의 차이를 극복하고, 개발 장비에서도 실제 스마트 월렛 동작과 동일한 수준의 가스 비용/수수료 시뮬레이션을 가능케 한다.

작업:

1. **로컬 Anvil Fork 모드 도입 및 가스 오프셋 시뮬레이션**:
   - 단순히 목(Mock) 데이터를 쏘는 Fake CDP 모드는 실제 가스 고갈이나 트랜잭션 에러를 잡아내지 못함.
   - 이에 따라 로컬 실행 스크립트(`scripts/smoke-local.sh`)에 Base Sepolia 온체인 데이터를 로컬 메모리에 포크(Fork)하는 Anvil Fork 환경 설정 주입:
     ```bash
     # 로컬 Anvil에서 Base Sepolia를 1초 블록 타임으로 포크하여 완벽한 온체인 가상환경 구축
     anvil --fork-url $BASE_SEPOLIA_RPC_URL --block-time 1 --port 8545
     ```
   - 로컬 가스비 시뮬레이션을 자동화하고, CDP Paymaster의 스폰서십이 로컬 가상 체인에서 올바르게 가스 차감 및 수수료 매칭을 시뮬레이션할 수 있도록 환경 설정 스위처 탑재.

2. **통합 프로파일 관리 및 스크립팅 고도화**:
   - `docker-compose.integration.yml`을 통해 PostgreSQL 및 Redis, Mock CDP 가스 중계 프록시 서비스를 원클릭 구동.
   - 로컬과 원격 스테이징 실행 파이프라인의 분기 설정을 완전 자동화하여, 개발자가 직접 `.env` 파일을 복잡하게 수동 스위칭하지 않도록 돕는 `scripts/switch-env.sh` 제작.

완료 기준:

- `scripts/smoke-local.sh` 실행 시, 임시 로컬 PostgreSQL 마이그레이션부터 시작하여 Anvil Fork 기반의 스마트 월렛 가스 서명 및 결제가 무오류로 원격 RPC 연결 없이 100% 로컬 재현 검증됨을 확인.
- `scripts/smoke-staging.sh`가 실제 Base Sepolia 테스트넷 환경을 타겟으로 안전하게 격리된 샌드박스 테스팅을 실행하고 완벽한 영수증 대조를 수행하여 `docs/evidence/` 밑에 증거 문서를 산출.

### 9단계: 구현 실행 안내서 및 증거 묶음

**목적:** 구현 검증을 memory나 임시 수동 절차에 의존하지 않게 만든다.

작업:

1. `docs/implementation-runbook.md` 작성
   - End-to-end 구현 검증 script
   - 실환경 chain 또는 external service dependency 실패 시 fallback path
   - 정확한 명령어
   - 기대 출력

2. 증거 index 작성
   - `docs/evidence/index.md`
   - contract deploy tx
   - UserOperation tx
   - Vault event
   - receipt header
   - DB verification SQL result
   - CLI hook 드라이런
   - web verification captures
   - 토큰 절감 보고서

3. 재현 가능한 transcript 수집
   - Sepolia payment and claim 흐름
   - CLI harness 흐름
   - Web UI 흐름

완료 기준:

- 실환경 service 실패 시에도 recorded transcript로 구현 검증 흐름을 확인 가능
- 모든 구현 claim에 연결된 증거 item 존재

## 4. 추가 추천 작업

### 4.1 Claim API 계층

Contract에는 `claimCreatorBalance`가 있지만, 현재 product surface에서는 API/client 지원이 필요하다.

추가할 것:

- `GET /claims/me` 또는 `GET /wallet/claimable`
- `POST /claims/submit` 또는 web3 direct-write helper
- claim tx tracking

이유:

- 이 계층이 없으면 web UI가 contract를 직접 wallet library로 호출해야 하거나 creator payout을 노출할 수 없다.

### 4.2 대조/복구 및 refund state

Vault 직접 정산은 새로운 실패 모드를 만든다: onchain deposit은 성공했지만 DB receipt/delivery가 실패하는 경우다.

추가할 것:

- `api/src/services/vaultReconciliation.ts`
- unreconciled deposits용 health endpoint
- refund-required state
- admin/staging reconciliation command

이유:

- 돈이 contract에 들어간 순간 가장 먼저 나오는 안전성 질문은 "입금 성공 후 서버 실패 시 어떻게 복구하나"이다.

### 4.3 주소 및 secret 관리

추가할 것:

- `VAULT_ADDRESS`가 포함된 `.env.example`
- committed docs에 secret이 들어가지 않도록 점검
- `scripts/check-env.ts`
- `proofweave doctor` env checks

이유:

- 현재 repo에는 proxy, vault semantics, CDP, Supabase, Pinata, receipt HMAC, encryption key 등 움직이는 부품이 많다. 통합 실패의 대부분은 config mismatch에서 날 가능성이 높다.

### 4.4 안정적인 Foundry tooling

현재 local Foundry nightly는 `--offline` 없이는 panic이 발생할 수 있다.

추가할 것:

- Foundry version을 docs 또는 `.foundry-version`에 고정
- local verification에서는 `forge test --offline` 사용
- panic workaround를 implementation runbook에 기록

이유:

- 구현 검증이 nightly Foundry/macOS proxy crash에 막히면 안 된다.

## 5. 권장 실행 순서

1. **배포 상태 확정:** 1단계
2. **실결제 증명:** 2단계
3. **DB 상태 검증 가능화:** 3단계
4. **제품 인터페이스에 노출:** 4단계 + 5단계
5. **하네스 구현 완성:** 7단계
6. **토큰 절감 claim 공식화:** 6단계
7. **전체 통합 연결:** 8단계
8. **구현 증거 정리:** 9단계

## 6. 최소 구현 컷

시간이 부족하면 모든 항목을 동시에 끝내려고 하지 않는다. 최소 신뢰 가능한 구현 컷은 다음이다.

1. Base Sepolia에 vault upgrade 배포
2. 실제 CDP UserOperation tx 1개로 approve + deposit 증명
3. Receipt/ledger row가 vault event와 일치
4. CLI hook install 드라이런 및 publish 드라이런 동작
5. Web UI에서 payment status, receipt, claimable balance, user reputation log 표시
6. 토큰 절감 보고서는 실제 과금 증거가 아니라 벤치마크 기준으로 표시
7. 재현 가능한 검증 transcript 존재
