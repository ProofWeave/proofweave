# ProofWeave Creator Claim — Implementation Plan (Inventory + Design)

> 상태: **PLAN ONLY. 아직 구현 안 함.** 아래 "Open Decisions"를 컨펌해야 구현 착수.
> 작성: Claude ultracode (5-subsystem 병렬 inventory + 4-designer fan-out + 직접 교차검증)
> Anchor: `docs/tool-plans/02-claim-ultracode.md`

---

## 구현 진행 상황 (2026-06-01)

- ✅ **D8 on-chain 확인**: proxy `0x758F…2e8E` `usdc()`=USDC(non-zero), 구현슬롯=vault-aware. vault 초기화됨.
- ✅ **API 페이즈**: `GET /claims/me`, `POST /claims/execute`(웹 CDP), `getCreatorEarnings`, `claimFromSmartWallet`, 라우트 마운트. API 빌드 clean, **79 테스트 통과**(claims 16), no-operator-custody 정적 가드 포함.
- ✅ **Web 페이즈**: `CLAIM_ABI`+`VAULT_ADDRESS`(wagmi.ts), `ClaimsPage`(웹 CDP 주 경로 + EOA 직접서명 조건부, §6 상태머신), `/claims` 라우트 + 'Earnings' nav. web 빌드 통과, ClaimsPage lint clean.
- ✅ **Contract regression**: `forge test` 38 통과 (Solidity 무변경).
- ⏳ **남은 것**: 로그인 세션 기반 수동 UI 상태 워크(GATE 2 시각 확인), live E2E(staging/CDP — DEV는 placeholder tx), commit/push(GATE 3, 명시 요청 시).

---

## 0. Executive Summary — 먼저 읽을 것

### 직접 검증으로 확정된 핵심 사실
1. **`claimCreatorBalance(amount, to)`는 `msg.sender` 기반** (`src/AttestationRegistry.sol:208,214`). 즉 호출자 본인의 `_claimable[msg.sender]`만 차감. **backend가 creator 자금을 claim하는 것은 컨트랙트 차원에서 구조적으로 불가능.**
2. **on-chain read path가 이미 존재**: `vaultRead.read.claimableBalance([creator])` (`api/src/contracts/attestationRegistry.ts:22,46`). 새 endpoint가 그대로 재사용.
3. **creator key = `attest.ts`가 인증 신원에서 유도한 단일 주소** (`api/src/routes/attest.ts:63-77`):
   - 웹 유저(`apiKeyOwner`가 `web:`로 시작) → `req.smartWalletAddress` (CDP Smart Wallet)
   - CLI/지갑 유저 → `req.apiKeyOwner` (본인 EOA `0x…`)
   - 이 값이 `attestations.creator`, `pricing_policies.creator_address`, `access_receipts.creator_address`, on-chain `_claimable` key로 **모두 동일하게 전파**됨.
4. **단위**: DB는 `usd_micros`(1e6), 컨트랙트는 USDC base unit(6 decimals). USDC라서 수치적으로 1:1이지만 **값은 다름**(claimable = 입금−claim, gross = 전체 수익). 절대 합산/동일시 금지.

### 워크플로 산출물에서 교정한 오류 (직접 검증 결과)
- ❌ "backend walletClient가 claimCreatorBalance를 서명할 수 있으니 no-custody 위반" → **틀림.** operator가 호출하면 `_claimable[operator]=0`만 건드림. custody는 컨트랙트가 강제. 설계 규칙은 "claim route에 `vaultWrite`/`walletClient`를 연결하지 말 것"이지, 위반 위험 자체가 존재하는 게 아님.
- ❌ "user→creator 결정적 매핑이 없으니 `creatorAddress`를 client 쿼리 파라미터로 받아야 함" → **차선책.** `attest.ts`가 신원에서 항상 유도하므로 **서버 유도가 정답이자 더 안전**(임의 주소 조회 차단).
- ❌ "pricing.ts:58이 attestation.creator==creator를 체크" → **그 체크는 없음.** 실제 불변식: attest.ts가 creator를 한 번 유도해 attestation·pricing 양쪽에 동일 사용 + 컨트랙트가 deposit 시 `CreatorMismatch`로 재검증(`AttestationRegistry.sol:195-197`).

### ✅ 핵심 아키텍처 결정 (D1 — 검증 후 해결됨): 하이브리드 claim 경로
**웹 유저의 creator key는 CDP Smart Wallet 주소이고, 컨트랙트는 `msg.sender == creator`를 요구한다.** 검증 결과(`wallet.ts:278-349`), **현재 결제(deposit)는 유저가 브라우저에서 서명하지 않는다** — 백엔드가 `cdp.evm.sendUserOperation({ smartAccount, calls:[approve, depositForAttestation] })`로 **유저 본인의 CDP smart wallet에서** UserOp를 전송하고 owner EOA 키는 CDP TEE에 있다. 즉 유저는 지갑 생성 시 CDP에 위임했고 백엔드는 오케스트레이션만 한다.

→ **claim도 동일 메커니즘으로 가능하다 (컨트랙트 변경 0건).** 백엔드가 creator 본인의 smart wallet에서 `claimCreatorBalance(amount, to)` UserOp를 보내면 `msg.sender = creator`가 충족된다. 계정 타입이 경로를 강제한다:

| 계정 타입 | creator key | claim 경로 | msg.sender |
|---|---|---|---|
| **웹 유저** (`web:` 식별자, 웹 /claims 주 사용자) | CDP Smart Wallet | **백엔드 `POST /claims/execute` → CDP UserOp** (결제 위임과 동일) | creator의 smart wallet ✅ |
| **CLI/EOA 유저** (실제 `0x` EOA, CDP 지갑 없음) | 본인 EOA | **본인 직접 서명** (wagmi `useWriteContract` 또는 CLI) | 본인 EOA ✅ |

**금지 모델과의 구분 (중요):** 금지된 것은 *operator/deployer 키*(`walletClient`/`vaultWrite`/`operatorAccount`)로 claim하는 것 — `msg.sender=operator`라 무용하고 프로토콜 공용키로 대리하는 custody. 허용되는 것은 *유저 본인의 CDP 위임 지갑*이 인증된 본인 요청에 의해 실행하는 것 — **결제와 완전히 동일한 신뢰경계**. 두 모델을 절대 혼동하지 말 것.

---

## 1. 현재 claim 관련 구현 Inventory (산출물 #1)

### 1.1 Contract (`src/AttestationRegistry.sol`) — 이미 구현됨
| 요소 | 위치 | 내용 |
|---|---|---|
| `claimCreatorBalance(uint256 amount, address to)` | :208 | `_claimable[msg.sender]` 차감 후 `to`로 `safeTransfer`. `nonReentrantVault`. |
| `claimableBalance(address creator) view → uint256` | :223-225 | `_claimable[creator]` 무가스 조회 |
| `depositForAttestation(bytes32 attestationId, address creator, uint256 amount, bytes32 receiptRef)` | :184-205 | `att.creator != creator`면 `CreatorMismatch` revert. `_claimable[creator] += amount`. `msg.sender`(payer)로부터 `safeTransferFrom`. `receiptRef` 중복 차단. |
| `_claimable` mapping | :55 | `mapping(address => uint256)` — creator → claimable USDC |
| `_receiptCredited` | :57-58 | receiptRef replay 방지 |
| `CreatorClaimed(creator, to, amount)` | :86 | claim 이벤트 (tx 추적용) |
| `VaultDeposited(receiptRef, attestationId, creator, payer, amount)` | :79-85 | 입금 이벤트 (reconciliation 소스) |
| `usdc` (IERC20) | :52 | `initializeVault(usdcToken)` (onlyOwner, reinitializer(2))로 1회 설정. 미설정 시 claim/deposit `VaultNotInitialized` revert |
| 에러 | :92-105 | `InsufficientClaimable`, `ZeroAmount`, `ZeroAddress`, `VaultNotInitialized`, `ReentrantCall` 등 |
| **pause 없음** | — | claim을 멈출 plag 없음. 유일한 차단 조건은 `usdc == address(0)` |

> Solidity 변경 0건. claim/read 함수는 이미 배포됨(메모리: Base Sepolia에 Vault 업그레이드 배포 확인).

### 1.2 API Contract/Config (`api/src/contracts/`, `api/src/config/`)
- **ABI** (`abi.ts:56-90`): `claimCreatorBalance`(nonpayable), `claimableBalance`(view) 둘 다 존재.
- **`attestationRegistry.ts`**: viem `getContract`. `registryRead`/`vaultRead`(publicClient, read), `registryWrite`/`vaultWrite`(walletClient=operator, write). `vaultRead.read.claimableBalance([creator])` → `Promise<bigint>` 즉시 사용 가능.
- **`chain.ts`**: `publicClient`(baseSepolia, RPC). `walletClient` = `operatorAccount`(=`privateKeyToAccount(OPERATOR_PRIVATE_KEY ?? DEPLOYER_PRIVATE_KEY)`). **이 signer는 attest/deposit 전용 — claim에 절대 연결 금지.**
- **`env.ts`**: `BASE_SEPOLIA_RPC_URL`(필수), `PROXY_ADDRESS`(기본 `0x758F…2e8E`), `VAULT_ADDRESS`(optional), `USDC_CONTRACT_ADDRESS`(기본 Base Sepolia USDC `0x036C…F7e`), `OWNER_ADDRESS`/`OPERATOR_ADDRESS`, `DEPLOYER_PRIVATE_KEY`/`OPERATOR_PRIVATE_KEY`. **CHAIN_ID env 없음** — `baseSepolia`(84532) 하드코딩.
- **`cdp.ts`**: CDP client(서버관리 smart wallet). claim에 사용 안 함.

### 1.3 API Services / DB (`ledger.ts`, `receipt.ts`, `vaultReconciliation.ts`, `migrate.ts`)
- **`access_receipts`** (`migrate.ts:82-97`): `receipt_id, attestation_id, payer, payment_method, tx_hash, amount_usd_micros, creator_address, vault_address, vault_tx_hash, vault_receipt_ref, claimable_amount_usd_micros, hmac, paid_at, expires_at`. `vault_receipt_ref` unique index.
- **`payments_ledger`** (`migrate.ts:147-161`): 위와 유사 + `receipt_id` FK, `created_at`. `creator_address` indexed.
- **`ledger.ts`**: `recordPayment`, `getPaymentHistory(payer)`. **creator별 gross 집계 함수 없음 → 신규 필요.**
- **`receipt.ts`**: `issueReceipt(..., settlement?)` — settlement에 `creatorAddress, vaultTxHash, vaultReceiptRef, claimableAmountUsdMicros` 포함. `claimable_amount_usd_micros`는 reconciliation 성공 전까지 NULL.
- **`vaultReconciliation.ts`**: `VaultDeposited` 이벤트를 per-tx 스캔 → receipt+ledger upsert. **per-creator 집계나 `claimableBalance` 조회는 안 함.** 3분 주기 스케줄러.
- **단위**: 모든 money 컬럼 `_usd_micros`(1e6). reconciliation은 on-chain amount를 무변환으로 `claimable_amount_usd_micros`에 대입(`vaultReconciliation.ts:101`) — USDC 6 decimals라 1:1.

### 1.4 API Routes / Middleware / Auth
- **`authenticate.ts:42-43`**: `req.apiKeyOwner = result.walletAddress`, `req.smartWalletAddress = result.smartWalletAddress`. (주의: `verifyApiKey`가 `eoaAddress`도 반환하지만 req에 안 붙임.)
- **`auth.ts verifyApiKey:141-159`**: `api_keys`에서 `wallet_address, smart_wallet_address, eoa_address` 조회. `wallet_address`는 등록 시 EIP-191 서명한 주소(CLI는 EOA, 웹은 `web:<email>`).
- **`attest.ts:63-77`**: creator 유도 단일 지점 (위 §0.3).
- **`pricing.ts setPrice:40-68`**: `creator` 그대로 lowercase 저장. UPSERT `WHERE creator_address = $2` (동일 creator만 갱신).
- **`x402Gate.ts`**: `getPrice` → `pricing.creatorAddress` → `depositUsdcToVaultFromSmartWallet(...creator)` → settlement → `issueReceipt`/`recordPayment`. payer = `req.apiKeyOwner`.
- **`purchases.ts`**: `GET /purchases/mine|history`는 `payer` 기준(소비자 시점). creator 시점 endpoint 없음.

### 1.5 Web (`web/src/`)
- **`wagmi.ts`**: chains `[baseSepolia]`(84532)만, connectors `[injected()]`만, `ERC20_TRANSFER_ABI`만 보유. **CLAIM_ABI 없음, CDP Smart Wallet 커넥터 없음.**
- **`App.tsx:84-97`**: `ProtectedRoute > AppLayout` 하위에 dashboard/attest/explorer/analytics/settings/admin. **`/claims` 없음.** `ProtectedRoute`는 Supabase 세션만 가드(지갑 아님).
- **`AppLayout.tsx:17-24`**: `NAV_ITEMS` 배열 — 사이드바·Cmd+K 자동 생성.
- **`AuthContext.tsx`**: Supabase User(이메일)만. **지갑 주소 없음.** wagmi `useAccount()`와 완전 독립.
- **`SettingsPage.tsx`**: 계정/Smart Wallet/외부지갑/MyData/구매내역/API Key 카드. **검증된 write 패턴 보유**: `useSwitchChain` → `useWriteContract` → `useWaitForTransactionReceipt` (`:44-48,119-127`). Creator Earnings 섹션 없음.
- **`lib/api.ts`**: `X-API-Key` 헤더, `get<T>()`/`post<T>()`, base `VITE_API_URL`.

### 1.6 빠져 있는 것 (구현 대상)
- creator가 claimable을 보는 web surface (route/page/component)
- creator gross 집계 backend 함수 + read-only endpoint
- frontend용 CLAIM_ABI + vault 주소 상수
- direct-write claim 흐름 (wallet-mismatch/wrong-network/pending/revert 상태머신)
- **웹/CDP-Smart-Wallet creator의 claim 경로 결정** (D1)

---

## 2. Creator Address — Source of Truth (산출물 #2)

**단일 권위 정의:** 컨트랙트 `_claimable`의 key는 `depositForAttestation`에 전달된 `creator` 주소이고, 이는 `attest.ts`가 인증 신원에서 유도해 `attestations.creator` / `pricing_policies.creator_address` / `access_receipts.creator_address`로 동일하게 전파한 값이다.

```
contract _claimable key
  == attestations.creator (on-chain & DB)
  == pricing_policies.creator_address (lowercased)
  == payments_ledger.creator_address (lowercased)
```

**불변식이 성립하는 메커니즘 (정확히):** `attest.ts:64-77`이 요청당 `creator`를 **한 번** 계산해 `createAttestation({creator})`와 `setPrice(id, creator, …)` 양쪽에 같은 값을 넘긴다. 컨트랙트는 deposit 시 `att.creator != creator`면 revert(`:195-197`)하여 DB행 변조로 타 주소에 credit되는 것을 막는다. (※ 워크플로가 주장한 "pricing.ts가 attestation.creator를 체크"는 사실이 아님 — 동일 변수 사용으로 보장됨.)

**API가 로그인 유저의 creator를 유도하는 법 (claim time이 아니라 attest time과 동일 규칙 재사용):**
```ts
const apiKeyOwner = req.apiKeyOwner!;                 // = api_keys.wallet_address
const isWebUser   = apiKeyOwner.startsWith("web:");
const creator     = isWebUser ? req.smartWalletAddress : apiKeyOwner;
// isWebUser && !smartWalletAddress → creator 없음 (수익 불가 상태)
```
→ **한 유저는 모든 attestation에서 동일한 creator 주소를 갖는다** (per-attestation으로 자유 선택되는 값이 아님). 따라서 `GET /claims/me`는 **서버에서 creator를 유도**하면 되고, client가 주소를 넘길 필요가 없다.

**플래그할 불확실성:**
- (저위험) `attestations.creator`를 변조하는 다른 코드 경로는 확인되지 않음(작성자는 `createAttestation`만). 전수감사는 미수행.
- (실무 안정) CDP smart wallet은 `POST /wallet/create`로 1회 생성, `rotateApiKey`가 `smart_wallet_address`/`eoa_address`를 이관(`auth.ts:197-221`)하므로 키 회전에도 동일 유지.
- **case sensitivity**: DB는 lowercase 저장. viem read/write 전 `getAddress()`로 checksum 정규화, DB 비교 전 `.toLowerCase()`. 불일치 시 조용히 "0 balance" footgun.

---

## 3. Identity Mapping (산출물 #3)

| 신원 | 실제 정체 | `_claimable` key와 동일? | 불일치/리스크 |
|---|---|---|---|
| **`req.apiKeyOwner`** (`api_keys.wallet_address`) | API Key 소유자 식별자. **CLI=실제 EOA `0x…`, 웹=`web:<email>` 문자열(주소 아님)** | CLI: ✅ / 웹: ❌(주소조차 아님) | 웹 유저의 apiKeyOwner를 creator로 쓰면 100% zero-balance 버그 |
| **`api_keys.smart_wallet_address`** | CDP ERC-4337 Smart Account. 웹 creator 자금이 여기로 credit됨 | 웹: ✅ / CLI: N/A | **컨트랙트 계정** → injected EOA tx의 msg.sender가 될 수 없음. "잔액 보유자(smart wallet)"와 "서명자(브라우저 EOA)"의 분리 = **wallet-mismatch의 핵심** |
| **`api_keys.eoa_address`** | CDP Smart Account의 owner EOA(UserOp 승인자) | ❌ 절대 아님 | smart wallet을 제어하지만 `_claimable` key는 아님. 이걸로 claim하면 0 조회 |
| **connected wagmi wallet** (`useAccount().address`) | 브라우저 injected EOA. Supabase auth/`api_keys`와 무관 | 유저가 creator와 정확히 같은 EOA를 연결했을 때만(CLI형) | auth 신원과 자동 연결 없음. 다른 지갑 연결 시 `msg.sender`가 달라져 0 잔액 claim → revert. **주된 mismatch 실패** |
| **`pricing_policies` / `payments_ledger.creator_address`** | `attestations.creator`의 lowercase 사본 | ✅ 구조상 동일 | claim의 권위 DB mirror. 조회·비교의 기준값 |

**claim feature가 key로 삼을 값:**
- **read/display**: 서버 유도 `creator`로 `claimableBalance(creator)` 조회 (client가 주소 공급 X).
- **sign/send**: tx의 `msg.sender`가 그 `creator`와 같아야 함. claim 버튼 활성화 전 `connectedWallet.toLowerCase() === creator.toLowerCase()` assert. **웹/Smart-Wallet creator는 injected EOA로는 이 assert가 사실상 항상 실패 → D1.**

---

## 4. `GET /claims/me` 설계 (산출물 #4)

### 라우트/인증
- `GET /claims/me`, `authenticate` 미들웨어 재사용(`purchases.ts`와 동일). 익명 불가(수익은 사적 재무정보).
- **creator는 서버 유도** (§2 코드). client 파라미터 받지 않음 → 임의 주소 조회 차단, attest 로직과 일관.

### 읽는 것
- **DB gross (신규 집계 함수)**: `payments_ledger`
  ```sql
  SELECT COALESCE(SUM(amount_usd_micros),0)::text AS gross_earned_usd_micros,
         COUNT(*)::int AS payment_count,
         MAX(vault_tx_hash) FILTER (WHERE vault_tx_hash IS NOT NULL) AS latest_vault_tx,  -- 또는 created_at 최신행
         COALESCE(SUM(claimable_amount_usd_micros),0)::text AS reconciled_deposited_usd_micros
  FROM payments_ledger WHERE creator_address = $1   -- lower(creator)
  ```
  `::text` 캐스트로 BIGINT를 JS Number로 반올림시키지 않음. (`ledger.ts`에 `getCreatorEarnings(creator)` 신규 추가 — 기존엔 payer 기준 조회만 있음.)
- **on-chain claimable**: 기존 `publicClient` 재사용, `vaultRead.read.claimableBalance([getAddress(creator)])` → `bigint` → **`.toString()`**.

### 응답 shape (DB ↔ on-chain 분리, 문자열, 단위 명시)
```jsonc
// 200 OK
{
  "creator": "0x… 또는 null(웹 유저 smart wallet 미생성)",
  "chainId": 84532,
  "vaultAddress": "0x…",
  "usdcAddress": "0x…",
  "db": {
    "grossEarnedUsdMicros": "12500000",          // SUM(amount_usd_micros)
    "reconciledDepositedUsdMicros": "12500000",  // SUM(claimable_amount_usd_micros)
    "unit": "usd-micros",
    "paymentCount": 5,
    "latestVaultTxHash": "0x…",
    "latestPaymentAt": "2026-06-01T00:00:00.000Z"
  },
  "onchain": {
    "claimableBaseUnits": "12500000",            // claimableBalance(creator), string
    "unit": "usdc-base-units",
    "available": true                            // read 실패 시 false
  },
  "reconciled": true,    // onchain.available && onchain.claimable == db.reconciledDeposited
  "warnings": []
}
```
**규칙:**
- `db.grossEarned`와 `onchain.claimable`은 **절대 합산/단일 "balance"로 병합 금지.** gross는 누적 수익, claimable은 현재 인출가능액(부분 claim마다 감소). 정상적으로 다름.
- `reconciled`는 on-chain claimable ↔ DB `reconciledDeposited`(둘 다 vault 입금 net of claim) 비교. **gross와 비교하지 않음**(gross는 수수료/미정산/기claim으로 통상 더 큼).

### degraded 동작 (on-chain 실패 시 500 금지)
- DB read 실패 → 500 (진짜 서버 오류).
- **on-chain read 실패 → 독립 try/catch, 200 유지** + `onchain.available=false, claimableBaseUnits=null`, `warnings:["onchain_read_failed"]`. DB 수익은 여전히 렌더, claim 버튼만 비활성. RPC 타임아웃 abort 추가.
- vault 미초기화/주소 오설정 → 동일 degraded 처리.
- on-chain claimable이 DB 누적 입금액(reconciledDeposited)을 **초과**하면(reconciliation 지연/누락) → `warnings:["onchain_exceeds_db_reconciled"]` (정보성, 실패 아님). ※ BigInt 비교로 판정.

### 등록/재사용
- 신규 `api/src/routes/claims.ts` (`claimsRouter`), `purchasesRouter`와 같은 `app.use(...)` 블록에 마운트.
- 재사용: `authenticate`, `pool`, `publicClient`, `vaultRead.read.claimableBalance`.
- `GET /claims/me`(read-only)는 **절대 import 금지**: `walletClient`, `vaultWrite`, `registryWrite`, `operatorAccount`, `getCdpClient`.

---

## 4b. `POST /claims/execute` — 웹 유저 CDP 위임 claim (산출물 #4 보강, D1 해결)

> **웹 유저 전용.** CLI/EOA 유저는 이 endpoint를 쓰지 않고 본인이 직접 서명(§7).

결제(`depositUsdcToVaultFromSmartWallet`)와 **동일한 CDP 위임 패턴**으로, creator 본인의 smart wallet에서 `claimCreatorBalance` UserOp를 전송한다.

### 라우트/인증/권한
- `POST /claims/execute`, `authenticate` 미들웨어.
- **creator는 서버 유도** (§2): `creator = req.smartWalletAddress` (웹 유저). client가 creator를 못 넘김 → **유저는 자기 smart wallet 잔액만 claim 가능**(cross-user 불가).
- 웹 유저가 아니거나(`apiKeyOwner`가 `web:`로 시작 안 함) smart wallet 없으면 → `400`(CLI 유저는 직접 서명 안내).

### 요청/검증
```jsonc
// body
{ "amount": "12500000", "to": "0x… (선택, 기본=본인 smart wallet)" }
```
- `amount`: string → `BigInt`. `0 < amount`.
- 전송 전 `vaultRead.read.claimableBalance([creator])` 재조회 → `amount <= claimable` 검증(초과 시 400, 컨트랙트 `InsufficientClaimable` 사전차단).
- `to`: non-zero, checksum 유효. 기본값 = 본인 smart wallet(자금이 본인 통제 지갑에 남아 Settings 잔액에 반영). 외부 출금주소 지정 허용.
- **동시/중복 claim 가드**: per-creator advisory lock 또는 pending-claim 추적으로 더블클릭에 의한 의도치 않은 연속 claim 방지(claim은 receiptRef 같은 idempotency가 없음).

### 실행 (deposit과 동일 메커니즘)
```ts
const { cdp, smartAccount } = await getSmartAccountForPayment(creatorSmartWallet); // wallet.ts 재사용
const userOp = await cdp.evm.sendUserOperation({
  smartAccount, network: "base-sepolia",
  calls: [{ to: VAULT_ADDRESS, value: 0n,
    data: encodeFunctionData({ abi: claimAbi, functionName: "claimCreatorBalance", args: [amount, toHex] }) }],
});
const result = await cdp.evm.waitForUserOperation({ userOpHash: userOp.userOpHash, smartAccountAddress: userOp.smartAccountAddress, waitOptions:{ timeoutSeconds:60 } });
if (result.status === "failed") // → 502/에러 매핑
return { txHash: result.transactionHash };
```
- **DEV MODE**: `!CDP_API_KEY_ID || NODE_ENV==="development"`면 deposit과 동일하게 placeholder(`dev-claim-tx-…`) 반환. live tx는 staging/prod에서만.
- gas는 deposit과 동일 경로(CDP paymaster/sponsorship)로 처리.

### 신규 서비스
- `wallet.ts`에 `claimFromSmartWallet(creatorSmartWallet, amountBaseUnits, to): Promise<string>` 추가 — `getSmartAccountForPayment` + `sendUserOperation`(claim call) + `waitForUserOperation`. `transferUsdcFromSmartWallet`/`depositUsdcToVaultFromSmartWallet`와 동형.

### no-custody 규칙 (정정)
- 이 경로는 `getCdpClient`를 **사용한다**(유저 본인 위임 지갑). 이는 결제와 동일하므로 허용.
- 여전히 **절대 금지**: `walletClient`/`vaultWrite`/`registryWrite`/`operatorAccount`로 claim (operator custody). CI 정적 테스트는 이 operator 경로만 차단하도록 조정(§9).

---

## 5. `POST /claims/prepare` 필요 여부 (산출물 #5)

### 판단: **MVP에서 DEFER (만들지 않음).**

근거:
1. frontend가 backend 없이 claim 가능 — `SettingsPage`의 검증된 `switchChainAsync → useWriteContract → useWaitForTransactionReceipt` 패턴 재사용.
2. frontend가 부족한 건 **2-fragment ABI뿐** — `claimCreatorBalance`+`claimableBalance`. 정적 상수(컴파일타임). 런타임 endpoint로 ABI를 배달할 이유 없음 → `wagmi.ts`에 `CLAIM_ABI` 상수로 인라인(기존 `ERC20_TRANSFER_ABI`와 동일 방식).
3. `claimCreatorBalance`는 nonpayable·무반환·nonce/permit/quote 없음 → prepare할 게 없음. calldata는 client가 ABI+args로 인코딩.
4. 컨트랙트 주소는 frontend env로 이미 알 수 있음(Base Sepolia 84532 단일 체인).
5. prepare는 backend coupling/scope-creep을 부르고 no-custody 의도와 충돌 소지.

대체: 부분/전액 `amount`·`to` 결정은 `GET /claims/me`의 `onchain.claimableBaseUnits`로 client에서. 컨트랙트가 최종 권위(`InsufficientClaimable` revert).

(만약 audit row/단일 주소소스 목적으로 원하면, **non-signing descriptor만** 반환 — `rawTransaction`/서명/operator 금지. 그러나 MVP 권장은 DEFER.)

---

## 6. Web Claims/Earnings UI 배치 + 상태머신 (산출물 #6)

### 권장: 전용 `/claims` 라우트 (label "Earnings"), Settings 카드 아님
이유: `SettingsPage`는 이미 자체 `useWriteContract`(USDC 충전)를 가짐. 같은 컴포넌트에 두 번째 write 흐름을 넣으면 `txHash` state 공유 footgun(`:68-75` 충전 confirm effect). 전용 라우트는 독립 write 훅·confirm effect·data fetch 확보. Earnings는 settings 토글이 아니라 1급 creator 워크플로.

### 배선
- `App.tsx:84-97` `ProtectedRoute>AppLayout` 그룹에 `<Route path="claims" element={<ClaimsPage/>} />` (동일 Supabase 가드 상속).
- `AppLayout.tsx:17-24` `NAV_ITEMS`에 `{ to:'/claims', icon: Award, label:'Earnings' }` (Analytics와 Admin 사이). 사이드바·Cmd+K 자동.
- 컴포넌트: `ClaimsPage`(wagmi 훅+상태머신+fetch) / `<EarningsSummary/>`(DB, 읽기전용) / `<ClaimableBalanceCard/>`(on-chain claimable+claim 폼) / `<ClaimStatusBanner/>`.

### 표시 필드
claimable USDC(on-chain) · gross earned(DB) · receipt count · latest vault tx · vault address · connected wallet · expected chain(Base Sepolia 84532) · recipient(`to`) 입력 · amount 입력 · Max 버튼 · Claim 버튼 · Refresh. **gross와 claimable은 별도 라벨, 합산 금지** + "둘은 정산지연/부분claim으로 다를 수 있고 claim 가능한 건 on-chain 값뿐" 설명 한 줄.

### 상태머신 — 경로별로 다름

`GET /claims/me`가 반환하는 계정 타입(웹/EOA)에 따라 UI가 분기한다.

**(A) 웹 유저 (CDP 위임, 주 경로) — 지갑연결/네트워크/mismatch 상태가 전부 사라져 단순:**

| 상태 | 조건 | UI |
|---|---|---|
| not authenticated | Supabase 세션 없음 | `ProtectedRoute` 리다이렉트(진입 전) |
| no creator address | smart wallet 미생성 | "수익을 받으려면 Smart Wallet 생성 후 attestation에 가격 설정" |
| zero balance | `claimable === 0n` | claimable "0.00", Claim 비활성. gross는 0 아닐 수 있다는 힌트 |
| invalid amount | `amount<=0` or `>claimable` or `to` 무효 | 인라인 에러, Claim 비활성 |
| ready | claimable>0 + valid amount + valid `to` | Claim 활성. `to` 기본=본인 smart wallet(편집가능), amount(Max=전액) |
| submitting | `POST /claims/execute` 진행 | "Claim 처리 중…" 버튼 비활성(중복제출 차단) |
| success | 200 + txHash | "Claimed N USDC" + BaseScan 링크 → claimable+DB refetch, amount 리셋. 잔여>0이면 ready |
| failure | 4xx/5xx/UserOp failed | 에러 사유 표시, 재시도. 잔액 변동 가능성 시 refetch |

> 웹 경로는 wagmi 지갑 연결이 **불필요**(서버가 본인 smart wallet로 실행). wrong-network/wallet-mismatch 개념 없음.

**(B) CLI/EOA 유저 (직접 서명, connected wallet === creator EOA일 때만) — MVP 후순위, 필요 시:**

| 상태 | 조건 | UI |
|---|---|---|
| wallet not connected | `!isConnected` | "Connect wallet" CTA(injected). DB 요약은 표시 가능 |
| wrong network | `chain.id !== 84532` | "Switch to Base Sepolia" → `switchChainAsync` |
| **wallet mismatch** | `connected ≠ creator EOA` | **하드 블록** 배너. Claim 비활성 |
| ready | connected+correct chain+match+claimable>0+valid amount | Claim 활성 |
| pending/confirming/success/rejected/revert | `useWriteContract`+`useWaitForTransactionReceipt` | §7-B 흐름, `SettingsPage` 패턴 |

---

## 7. Claim 실행 설계 (산출물 #7) — 하이브리드

계정 타입이 서명 주체를 강제한다(§0 표). 두 경로 모두 **operator/deployer 키로 claim하지 않는다.**

### 7-A. 웹 유저 — CDP 위임 (주 경로)
`POST /claims/execute` (§4b). 백엔드가 creator 본인 smart wallet에서 `claimCreatorBalance` UserOp 전송 → `msg.sender = creator`. 결제(`depositUsdcToVaultFromSmartWallet`)와 동일 메커니즘·신뢰경계. **유저는 브라우저 서명 불필요**, UI는 amount/`to` 입력 + Claim 버튼(§6-A). 상세는 §4b.

### 7-B. CLI/EOA 유저 — 직접 서명 (후순위, connected wallet === creator EOA)
`SettingsPage.tsx:113-131`(USDC 충전 흐름)을 그대로 미러. 대상 컨트랙트/ABI/함수/args만 다름.

#### no-backend-signing 확정 (B 경로)
- claim tx는 100% client-side wagmi `useWriteContract`로 유저 injected wallet이 서명.
- backend `operatorAccount`/`walletClient`/`vaultWrite`는 **claim 경로에 연결 금지**. (컨트랙트가 `msg.sender` 기반이라 설령 호출해도 creator 자금 못 가져감 — 이중 안전.)

#### 흐름
```ts
const { address: connected, isConnected, chain } = useAccount();
const { switchChainAsync } = useSwitchChain();
const { data: txHash, writeContract, isPending } = useWriteContract();
const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
// claimable read: useReadContract({ address: VAULT_ADDRESS, abi: CLAIM_ABI, functionName:'claimableBalance', args:[creator] })
```
1. **mismatch 가드(서명 전)**: `isConnected && connected.toLowerCase() === creator.toLowerCase()` 아니면 차단.
2. **chain 체크**: `if (chain?.id !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });`
3. **write 구성**: `amount`는 유저가 입력한 human USDC → `parseUnits(amountStr, 6)`(USDC 6 decimals, 충전 흐름과 동일). `to`는 recipient 입력(기본 connected). 인자 순서 `(amount, to)`.
   ```ts
   writeContract({ chainId: baseSepolia.id, address: VAULT_ADDRESS, abi: CLAIM_ABI,
     functionName: 'claimCreatorBalance', args: [parseUnits(amountStr, 6), recipient] });
   ```
   ⚠️ usd-micros DB 정수를 그대로 쓰거나 1e6 곱하지 말 것 — 반드시 human USDC 입력에서 `parseUnits(_,6)`.
4. submit → `isPending`로 "Confirm in wallet…".
5. `useWaitForTransactionReceipt` → confirming/success.
6. **success 시 refetch**: `claimableBalance(creator)` + DB 요약 재조회, amount 리셋.
7. **부분 claim**: amount 입력 free-form, `0 < parseUnits(_,6) <= claimable` 검증, Max 버튼=전액. 성공 후 잔여>0이면 ready 복귀(컨트랙트가 `_claimable -= amount`로 네이티브 지원).

revert 매핑: 초과→`InsufficientClaimable`(client 사전검증, stale시 refetch 복구), 0/zero-addr→`ZeroAmount`/`ZeroAddress`(사전검증), 미초기화→`VaultNotInitialized`(일반 배너), 유저거부→try/catch.

### frontend 신규 상수
- `CLAIM_ABI`(claimCreatorBalance nonpayable + claimableBalance view) — `wagmi.ts`에 인라인.
- vault 주소 — `VITE_VAULT_ADDRESS`(권장) 또는 `USDC_ADDRESS` 옆 상수. (= 업그레이드된 proxy 주소)

---

## 8. Edge Cases (산출물 #8)

| # | 케이스 | 레이어 | 처리 |
|---|---|---|---|
| 1 | on-chain read 실패(RPC) | api+web | api: try/catch→200+`available:false`+warning. web: DB 렌더, claim 비활성 |
| 2 | DB행 있는데 on-chain claimable=0 (기claim 또는 미정산) | api+web | gross 표시 + "현재 claim 불가" 중립 카피(둘 구분 불가). Claim 비활성 |
| 3 | on-chain claimable>0인데 DB 요약 0/누락 | api+web | on-chain을 권위로 Claim **활성**. DB 미동기 미세 노트 |
| 4 | creator 다중 receipt | api | `SUM/COUNT … WHERE creator_address=lower($1)`. on-chain은 단일 mapping read |
| 5 | 부분 claim | contract+web | 컨트랙트 `_claimable -= amount` 네이티브. amount 입력+Max, 성공 후 잔여 재조회 |
| 6 | amount > claimable | contract+web | `InsufficientClaimable`. web 사전검증으로 차단, stale시 revert 경로 복구 |
| 7 | recipient zero address | web | 컨트랙트에 `to==0` 가드 없음 → web에서 non-zero checksum 검증. 기본 connected |
| 8 | wrong chain | web | `switchChainAsync(84532)` 후 write. 거부 시 비활성 |
| 9 | wallet 미연결 | web | Connect CTA, controls 비활성. DB 요약은 표시 가능 |
| 10 | connected ≠ creator | web(+contract) | 하드 블록 배너. 컨트랙트가 `msg.sender` 잔액만 → 잘못된 지갑은 0/revert |
| 11 | 유저 tx 거부 | web | "취소됨" 중립 상태, 잔액 불변, 재시도 |
| 12 | tx revert(mined) | web | receipt `reverted` → "on-chain 실패" + BaseScan, claimable refetch, 재활성. 커스텀 에러 디코드 |
| 13 | tx 장시간 pending | web | "pending…" + BaseScan, 중복제출 차단(버튼 비활성). 자동취소/재전송 안 함 |
| 14 | 단위 mismatch (usd-micros vs base units) | api+web | 별도 필드 유지. DB는 `/1e6`, on-chain은 `formatUnits(_,6)`. claim amount는 human 입력→`parseUnits(_,6)`만 |
| 15 | claimableBalance 직렬화 overflow | api | `uint256 bigint` → `.toString()`. web `BigInt(str)`/`formatUnits` |
| 16 | vault 미초기화/주소 오설정 | contract+api | `VaultNotInitialized`. api는 #1처럼 degraded(200), 500 아님 |
| 17 | 빠른 더블클릭 | web | `isPending||isConfirming` 동안 비활성. 컨트랙트 `nonReentrantVault`+선차감 보호 |
| 18 | 웹/CDP creator claim (D1 해결) | api(CDP)+web | injected EOA로는 smart wallet `msg.sender` 불가 → **백엔드 CDP UserOp**(§4b)로 본인 smart wallet 실행. 결제와 동일 |
| 19 | CDP UserOp 실패(`result.status==="failed"`) | api | 502/에러 매핑, 잔액 불변(컨트랙트 revert), web "Claim 실패, 재시도" + claimable refetch |
| 20 | DEV MODE (CDP 미설정/development) | api | placeholder tx(`dev-claim-tx-…`) 반환, 실제 on-chain 변화 없음 — staging/prod에서만 live claim |
| 21 | 동시/중복 claim 요청 (더블클릭) | api | per-creator advisory lock/pending 추적. claim은 idempotency key 없음 → 가드로 의도치 않은 연속 인출 방지 |
| 22 | non-web 유저가 `/claims/execute` 호출 | api | `apiKeyOwner`가 `web:` 아님/smart wallet 없음 → 400 + "CLI는 직접 서명" 안내 |

---

## 9. Test Plan (산출물 #9)

### API (`cd api && set -a; source .env.test; set +a; npm test`)
신규 `api/src/__tests__/claims.route.test.ts` (`vaultRead.read.claimableBalance`·`pool` mock):
1. 미인증 → 401 (`authenticate`)
2. receipt 없는 creator → `grossEarnedUsdMicros:"0"`, `paymentCount:0` (크래시/null 없음)
3. receipt 있는 creator → 정확한 합·count, creator lowercase 필터 확인
4. on-chain claimable이 **문자열**(`.toString(bigint)`)로 반환
5. on-chain read 실패 → 200 + `available:false` + warning, DB는 유지
6. DB↔on-chain mismatch → 두 값 보존 + advisory flag, **병합 시도 없음**
7. **no-operator-custody 정적 테스트**: claims 라우트/서비스가 `walletClient`/`vaultWrite`/`registryWrite`/`operatorAccount`를 import하지 **않음** 검증 (CI 가드). `getCdpClient`는 웹 execute 경로에서 **허용**(유저 본인 위임 지갑).

#### `POST /claims/execute` (웹 CDP 경로) 추가 테스트 (`cdp.evm.sendUserOperation`/`waitForUserOperation` mock)
8. non-web 유저(`apiKeyOwner`가 `web:` 아님) / smart wallet 없음 → 400
9. `amount > claimable`(사전 read) → 400, UserOp 미전송
10. `to` zero/무효 → 400
11. 정상 → creator **서버 유도**(client creator 무시), `sendUserOperation`이 creator 본인 smart wallet로 호출됨 확인, txHash 반환
12. UserOp `status==="failed"` → 5xx 에러 매핑, 성공 응답 아님
13. DEV MODE(`!CDP_API_KEY_ID`) → placeholder tx, 실제 호출 없음
14. 동시 claim 가드: 같은 creator 중복 요청 직렬화/거부

### Web
- `npm --prefix web run build` (tsc + vite) 통과, `npm --prefix web run lint`
- 상태 렌더 매트릭스: 미연결/wrong-chain/mismatch/read-failed/zero/ready/invalid-amount/pending/success/rejected/revert (러너 미배선 시 `npm --prefix web run dev` 수동 체크리스트)

### Contract regression (Solidity 변경 0 → 무회귀 증명)
- `forge test --offline --disable-labels` 전체 green (Vault/Attest/Verify 포함)
- `forge snapshot --check` (`.gas-snapshot`) — gas 불변

### 알려진 환경 갭 (live E2E 한계)
remote Supabase migration 미적용, CDP dev placeholder tx hash (`result.md`). unit/contract test엔 영향 없음.

---

## 10. Implementation Order (산출물 #10)

> **GATE 0 — 코드 전 컨펌**: 아래 Open Decisions(특히 D1 creator claim 경로, D2 배치) 확정.

1. **[API]** `GET /claims/me` (read-only) + `ledger.ts`에 `getCreatorEarnings(creator)` 신규. creator **서버 유도**. DB 합 + on-chain read(string), 분리 필드, degraded try/catch. **operator-signer import 금지.**
2. **[API]** `POST /claims/execute` (웹 CDP, §4b) + `wallet.ts`에 `claimFromSmartWallet(...)` 신규. creator **서버 유도**, amount/`to` 검증, 동시 claim 가드, `sendUserOperation`+`waitForUserOperation`, DEV MODE placeholder.
3. **[API]** §9의 GET 7개 + execute 7개 테스트, `npm test`.
   > **GATE 1**: API 계약(GET 필드/타입/분리/degraded + execute 권한·검증·CDP) 컨펌.
4. **[Web]** `CLAIM_ABI`(B 경로용) + vault 주소 상수 + `api.get`/`api.post` 타입 추가.
5. **[Web]** `ClaimsPage` + 상태머신: **웹 경로(§6-A, `POST /claims/execute` 호출)** 우선 구현, EOA 직접서명(§6-B/§7-B)은 후순위/조건부.
6. **[Web]** 배치(전용 `/claims` 라우트 + NAV_ITEMS).
   > **GATE 2**: 배치/카피 컨펌.
7. **[QA]** web build/lint + 상태 매트릭스.
8. **[QA]** `forge test` 전체 + `forge snapshot --check` (병렬 가능, sign-off 전 필수).
9. **[QA]** (옵션) live E2E — 웹 CDP claim은 staging/prod에서만 live(DEV는 placeholder), 환경 갭 인지.
   > **GATE 3**: commit/push는 명시 요청 시에만, feature 브랜치(현재 main).

### 절대 건드리지 말 것
- **operator custody**: `walletClient`/`operatorAccount`/`vaultWrite`/`registryWrite`로 claim 금지 (테스트 #7이 CI 가드). ※ `getCdpClient`(유저 본인 위임 지갑)는 웹 execute 경로에서 허용 — 결제와 동일.
- Solidity 컨트랙트 / 배포된 proxy·vault (변경/재배포 없음).
- `vaultReconciliation.ts` 스케줄러 (per-tx reconciliation 그대로).
- `experiments/token-efficiency/**` 전부 (벤치마크 데이터셋/스크립트/fixture).

---

## Open Decisions — 결정 현황

**D1 (보안모델) — ✅ 해결.** 결제(deposit)가 CDP 위임으로 무서명 동작함을 검증 → claim도 동일하게 **유저 본인 CDP smart wallet UserOp**(`POST /claims/execute`)로 처리. operator custody 아님. 계정타입이 경로 강제: 웹=CDP, EOA=직접서명.

**D2 — ✅ 해결.** 전용 `/claims` 라우트 + 사이드바 'Earnings'.

**D5 — ✅ 해결.** `POST /claims/prepare` DEFER. (claim 실행은 웹=`/claims/execute`, EOA=client wagmi.)

**D3 — 채택(기본).** `GET /claims/me`·`/claims/execute` 모두 creator **서버 유도**(attest 로직 재사용). client 파라미터 안 받음.

**D4 — 채택(기본).** 웹 `to` 기본값=본인 smart wallet(편집가능, 외부 출금주소 허용). EOA는 connected wallet 기본. 모두 zero/checksum 검증.

**D6 — 채택(기본).** 전액 기본(Max) + 부분 claim 입력 허용.

**D7 — 채택(기본).** 서버 유도이므로 인증 유저는 자기 creator만 조회/claim(자동 보장).

**D8 — ⚠️ 배포 전 확인 필요(미해결 액션).** Base Sepolia vault에 `initializeVault`(usdc set) 호출됨 & `VAULT_ADDRESS` env가 업그레이드된 proxy 주소로 설정됨? 아니면 모든 claim `VaultNotInitialized` revert. (메모리상 Vault 업그레이드는 배포 확인됨 — `initializeVault` 호출/`VAULT_ADDRESS` 설정만 재확인.)

> D1/D2/D5 컨펌 완료. 남은 확인: **D8(vault 초기화 상태)** 만 구현 착수 전 점검하면 됨.
