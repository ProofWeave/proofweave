# ProofWeave — 기술 스택 & 아키텍처 상세 문서

> **작성일:** 2026-04-12  
> **목적:** 현재까지 구현된 기술적 결정과 특이점을 문서화하고, 향후 개발 남은 항목을 정리

---

## 1. 전체 기술 스택 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProofWeave Tech Stack                        │
├─────────────────┬──────────────────┬────────────────────────────┤
│  Smart Contract │  Backend API     │  Frontend                  │
│                 │                  │                            │
│  Solidity 0.8.28│  TypeScript ESM  │  React 19 + TypeScript     │
│  Foundry        │  Express 5       │  Vite 8                    │
│  OpenZeppelin   │  viem 2.47       │  React Router 7            │
│  UUPS Proxy     │  Pinata v2.5     │  TanStack Query 5          │
│  Base Sepolia   │  Zod 4           │  Recharts 3                │
│                 │  @x402/express   │  Lucide React              │
│                 │  @coinbase/cdp   │  Supabase JS               │
│                 │  @google/genai   │  react-json-view-lite       │
└─────────────────┴──────────────────┴────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Supabase │    │  Pinata  │    │Coinbase  │
   │PostgreSQL│    │  (IPFS)  │    │  CDP     │
   │+ Auth    │    │          │    │ERC-4337  │
   └──────────┘    └──────────┘    └──────────┘
```

---

## 2. 스마트 컨트랙트 계층

### 2-1. 기술 선택 이유

| 기술 | 선택 이유 |
|------|-----------|
| **Foundry** (forge, cast, anvil) | Hardhat 대비 빌드 속도 10배+, natively compiled 테스트, 가스 스냅샷 내장 |
| **UUPS Proxy** (ERC-1967) | Transparent Proxy 대비 가스비 절약, Implementation에 upgrade 로직 내장 → proxy 슬림 |
| **OpenZeppelin Upgradeable** | 업그레이드 안전성 보장 (Initializable, storage gap 패턴) |
| **Base Sepolia** | 이더리움 L2 (Optimism 기반) — 저비용, 빠른 finality, Coinbase 생태계 호환 |

### 2-2. 컨트랙트 아키텍처 특이점

#### 의도적 설계 결정: 결제 분리

```
[기존 설계 v9] 온체인 결제                    [현재 설계] 오프체인 결제
───────────────────────                     ───────────────────────
AttestationRegistry.sol                     AttestationRegistry.sol
├── attest()          ✅                    ├── attest()          ✅ 
├── verify()          ✅                    ├── verify()          ✅
├── deposit()         ❌ 삭제               └── (결제 없음 — 순수 provenance 전용)
├── payFrom()         ❌ 삭제
├── hasPaid()         ❌ 삭제               결제는 x402 프로토콜로 이동:
└── withdraw()        ❌ 삭제               ├── USDC 기반 (ETH 가격 변동 제거)
                                            ├── AccessReceipt (DB 기반 빠른 검증)
                                            └── CDP Smart Wallet 자동 결제
```

**이유:** 
- Native ETH 결제는 가격 변동 리스크 존재
- `hasPaid()` 매번 체인 읽기 → latency + 비용
- x402 (Linux Foundation 표준) 채택으로 범용 HTTP 에이전트 호환

#### operator 패턴

```solidity
modifier onlyOperator() {
    if (msg.sender != operator) revert Unauthorized();
    _;
}
```

- `owner`: 프로젝트 관리자 (upgrade, operator 변경)
- `operator`: API 서버 지갑 (attest 전용)
- `renounceOwnership()` 차단 → 항상 복구 가능

**특이점:** 에이전트가 직접 체인에 tx를 보내지 않음. API가 operator 지갑으로 대행. 범용 에이전트(ChatGPT, Claude 등)가 HTTP만으로 사용 가능하게 하기 위한 설계.

### 2-3. 테스트 구조

```
test/
├── unit/
│   ├── Attest.t.sol       — 등록 성공, 중복, 입력 검증, 이벤트
│   ├── Verify.t.sol       — 조회, 미존재, creator 목록
│   └── AccessControl.t.sol — operator 전용, owner 전용, 권한 차단
└── upgrade/
    └── UUPS.t.sol         — 업그레이드 성공, 비인가 업그레이드 차단
```

**33개 테스트, 100% coverage.** Forge의 Fuzz testing (foundry.toml: 256 runs 기본)도 지원 구조.

### 2-4. 배포 정보

| 항목 | 값 |
|------|-----|
| Network | Base Sepolia (Chain ID: 84532) |
| Proxy Address | `0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E` |
| Implementation | 별도 주소 (ERC-1967 슬롯에 저장) |
| Owner / Operator | `0x0df5Ea611e4868A42D600Aa2F552f72d7612f53c` |
| Solc Version | 0.8.28 (optimizer: 200 runs) |

---

## 3. Backend API 계층

### 3-1. 기술 선택 이유

| 기술 | 선택 이유 |
|------|-----------|
| **Express 5** | 최신 안정 버전, async error 처리 개선 |
| **TypeScript ESM** | `"type": "module"`, strict 타입, `tsx` DevX |
| **viem** | ethers.js 대비 tree-shaking 우수, TypeScript-first, ABI 타입 추론 |
| **Zod 4** | 런타임 입력 검증 + TypeScript 타입 자동 추론 |
| **Supabase (PostgreSQL)** | 관리형 DB + Auth + RLS 통합, 무료 티어 |
| **Pinata SDK v2.5** | IPFS pinning — 안정적 게이트웨이, JSON 메타데이터 지원 |
| **@x402/express** | HTTP 402 결제 게이트 표준 (Linux Foundation) |
| **@coinbase/cdp-sdk** | ERC-4337 Smart Account, TEE 서버 서명 |
| **@google/genai** | Gemini 2.0 Flash — AI 분석 (저비용, 빠른 응답) |

### 3-2. 암호화 아키텍처 (핵심 특이점)

```
┌──────────────────────────────────────────────────────────────┐
│                    키 아키텍처                                 │
│                                                              │
│  DATA_ENCRYPTION_KEY (마스터, 서버 전용, 32바이트 hex)         │
│         │                                                    │
│         ├── HKDF(master, salt="0xabc...")  → 파생키 A         │
│         │   └── AES-256-GCM 암호화/복호화 (Attestation A)     │
│         │                                                    │
│         ├── HKDF(master, salt="0xdef...")  → 파생키 B         │
│         │   └── AES-256-GCM 암호화/복호화 (Attestation B)     │
│         │                                                    │
│         └── HKDF(master, salt="0x123...")  → 파생키 C         │
│             └── AES-256-GCM 암호화/복호화 (Attestation C)     │
│                                                              │
│  ※ salt = contentHash (attestation 고유)                     │
│  ※ info = "proofweave-aes" (어플리케이션 컨텍스트)            │
│  ※ IV = 12바이트 랜덤 (GCM 권장)                             │
│  ※ Tag = 16바이트 GCM 인증 태그                               │
└──────────────────────────────────────────────────────────────┘
```

**특이점:**
- 마스터 키 1개로 모든 attestation을 암호화하되, HKDF로 attestation별 파생키를 생성
- 한 attestation의 키가 유출되어도 다른 attestation은 안전
- Canonical JSON(`json-stable-stringify`) → SHA-256 → 온체인 contentHash와 일치 보장
- 에이전트는 **평문만** 주고받음 — 암복호화는 모두 서버에서 처리

### 3-3. x402 결제 게이트 (3계층 구조)

```typescript
// x402Gate 미들웨어 핵심 흐름 (274줄)

// Layer 1: AccessReceipt 확인 (재결제 방지)
//  1a. X-ACCESS-RECEIPT 헤더 → HMAC + DB 검증
//  1b. 서버 내부 receipt 조회 (API Key 기반)
//  → 유효하면 즉시 통과

// Layer 2: 가격 조회
//  → pricing_policies 테이블 조회
//  → 무료(priceUsdMicros === 0)이면 즉시 통과

// Layer 3: 스마트 지갑 자동 결제
//  → CDP Smart Wallet 잔고 확인
//  → 충분하면 USDC 자동 전송 (ERC-20 transfer)
//  → viem으로 tx finality 확인
//  → 원자적 트랜잭션: receipt 발급 + ledger 기록 + quote 소비
//  → 잔고 부족 → 402 응답 + quoteId 발급
```

**특이점:**
- **P0-1 fix:** ERC-20 `transfer()` calldata를 직접 인코딩 (`0xa9059cbb` + paddedTo + paddedAmount)
- **P0-2 fix:** `waitForTransactionReceipt` 후에만 txHash 반환 (finality 확인)
- **P0-3 fix:** receipt + ledger + quote 소비 → 동일 PostgreSQL 트랜잭션 (PoolClient 공유)
- **Chain↔DB idempotency:** txHash로 ledger 중복 체크 → 재시도 안전

### 3-4. CDP Smart Wallet 통합

```
등록 시:
  POST /auth/register → cdp.evm.createAccount() → cdp.evm.createSmartAccount()
  → ERC-4337 Smart Account 주소를 api_keys.smart_wallet_address에 저장

결제 시:
  x402Gate → getSmartWalletAddress(payer) → getWalletBalance()
  → 잔고 충분 → transferUsdcFromSmartWallet()
  → CDP TEE에서 서명 → Policy Engine 검증 → 온체인 전송
```

**특이점:** 에이전트 소유자(사람)가 Smart Wallet에 USDC를 입금하면, 에이전트의 API 호출만으로 자동 결제. 지갑 서명/tx 생성을 에이전트가 할 필요 없음.

### 3-5. Attest 핵심 흐름

```
POST /attest
  │
  ├── 1. canonicalHash(data) → SHA-256 → contentHash (bytes32)
  │      └── json-stable-stringify로 키 순서 결정적 정렬
  │
  ├── 2. 중복 체크 (DB: content_hash + creator)
  │      └── 체인 AlreadyAttested revert 전에 빠르게 실패
  │
  ├── 3. AES-256-GCM 암호화
  │      └── HKDF(masterKey, salt=contentHash) → 파생키
  │
  ├── 4. IPFS 업로드 (Pinata)
  │      └── { version, encrypted: {ciphertext, iv, tag}, meta }
  │
  ├── 5. 온체인 attest tx
  │      └── registryWrite.write.attest([contentHash, creator, aiModel, ipfsCid])
  │
  ├── 6. waitForTransactionReceipt (confirmations: 2)
  │
  ├── 7. ABI 기반 Attested 이벤트 디코딩 → attestationId 추출
  │      └── decodeEventLog (viem) — topics 길이가 아닌 ABI signature 매칭
  │
  └── 8. DB 저장 (ON CONFLICT 재시도 안전)
```

### 3-6. 미들웨어 스택

| 미들웨어 | 파일 | 역할 |
|----------|------|------|
| `cors` | index.ts | 프론트엔드 origin 제한 (프로덕션: proofweave.vercel.app만) |
| `rateLimit` | rateLimit.ts | IP 기반 100req/min 글로벌 제한 |
| `authenticate` | authenticate.ts | API Key → wallet_address 조회 → req.apiKeyOwner 설정 |
| `x402Gate` | x402Gate.ts | 유료 리소스 결제 게이트 (3계층) |
| `errorHandler` | errorHandler.ts | 전역 에러 핸들링 |

### 3-7. DB 스키마

```sql
-- 6개 테이블
attestations          -- 온체인 attestation 데이터
api_keys              -- API Key 해시 + 지갑 + Smart Wallet
consumed_signatures   -- EIP-191 서명 리플레이 방지
access_receipts       -- x402 결제 영수증 (HMAC 서명)
pricing_policies      -- attestation별 가격 (USD micros)
payments_ledger       -- 결제 이력 원장
payment_quotes        -- 결제 견적 (TTL + 일회성)
```

**특이점:**
- `api_keys.key_hash` — 평문 API Key는 DB에 저장 안 함 (SHA-256 해시만)
- `api_keys.smart_wallet_address` — register 시 CDP Smart Wallet 자동 생성
- `access_receipts.hmac` — HMAC-SHA256 서명으로 위변조 방지
- `payments_ledger.tx_hash` — 인덱스 + IS NOT NULL 조건 (idempotency)
- `payment_quotes.consumed_at` — 일회성 보장 (이미 소비된 quote 재사용 방지)

### 3-8. 배포 인프라

```dockerfile
# Multi-stage Docker build
FROM node:22-alpine AS builder    # 빌드 스테이지
  → npm ci → tsc

FROM node:22-alpine               # 프로덕션 스테이지
  → npm ci --omit=dev             # devDependencies 제거
  → COPY --from=builder dist/     # 빌드 결과물만
  → ENV NODE_ENV=production
  → EXPOSE 3001
```

- **GCP Cloud Run:** Dockerfile 기반 서버리스 컨테이너
- **시크릿 관리:** .env (로컬) → GCP Secret Manager (프로덕션)
- **macOS Keychain 통합:** 민감 키를 로컬 keychain에서 런타임 로드

---

## 4. Frontend 계층

### 4-1. 기술 선택 이유

| 기술 | 선택 이유 |
|------|-----------|
| **React 19** | 최신 안정, concurrent 렌더링 |
| **Vite 8** | HMR 속도, ESM native |
| **TypeScript** | 타입 안전성 |
| **React Router 7** | SPA 라우팅 |
| **TanStack Query 5** | 서버 상태 관리 (staleTime, retry) |
| **Supabase Auth** | OAuth (Google/GitHub) — 소셜 로그인 |
| **recharts** | React 네이티브 차트 (Analytics 페이지) |
| **Lucide React** | 아이콘 라이브러리 (tree-shaking 우수) |
| **react-json-view-lite** | JSON 시각화 (attestation 상세) |

### 4-2. 인증 흐름 (특이점: Supabase → API Key 브리지)

```
┌──────────────────────────────────────────────────────────────┐
│                     인증 브리지 패턴                          │
│                                                              │
│  1. 유저 → Supabase OAuth (Google/GitHub)                    │
│  2. AuthContext → ensureApiKey(session)                      │
│  3. POST /auth/register-web + Bearer ${access_token}         │
│  4. 백엔드: JWT 검증 → api_keys 테이블 조회/생성             │
│  5. 프론트: sessionStorage에 API Key 저장                    │
│  6. 이후 모든 API 호출: X-API-Key 헤더 자동 첨부             │
│                                                              │
│  ※ 탭 종료 시 API Key 소멸 (sessionStorage)                 │
│  ※ 재로그인 시 기존 키 재사용 or 새로 발급                   │
└──────────────────────────────────────────────────────────────┘
```

**왜 이런 구조인가:**
- 원래 ProofWeave API는 **지갑 서명(EIP-191)** 기반 인증 → 에이전트용
- 웹 유저는 지갑이 없으므로 Supabase OAuth → API Key 브리지 필요
- 두 인증 경로가 공존: `/auth/register` (지갑 서명) + `/auth/register-web` (JWT)

### 4-3. 페이지 구성

| 페이지 | 경로 | 상태 | 기능 |
|--------|------|------|------|
| Login | `/login` | ✅ 동작 | Supabase OAuth (Google/GitHub) |
| Dashboard | `/` | ✅ 동작 | KPI 카드 4개 + 최근 attestation 테이블 |
| Attest | `/attest` | ✅ 동작 | AI 분석 (Gemini) → 온체인 등록 3단계 |
| Explorer | `/explorer` | ✅ 동작 | 검색 + 페이지네이션 + BaseScan 링크 |
| Analytics | `/analytics` | 🟡 빈 틀 | 향후 recharts 차트 연동 |
| Settings | `/settings` | 🟡 부분 | API Key 표시/복사, 가격 설정 비활성 |

### 4-4. 배포

- **Vercel:** `web/` 디렉토리 기준
- **SPA 라우팅:** `vercel.json` rewrite 규칙 (`/((?!assets/).*) → /index.html`)
- **캐시:** `/assets/*` → `public, max-age=31536000, immutable`
- **환경변수:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`

---

## 5. 보안 아키텍처 요약

### 5-1. 데이터 보호

| 레이어 | 보호 메커니즘 |
|--------|--------------|
| 온체인 | contentHash만 저장 (원본 데이터 노출 없음) |
| IPFS | AES-256-GCM 암호문만 저장 (서버만 복호화 가능) |
| DB | API Key는 SHA-256 해시만 저장 |
| 전송 | HTTPS + CORS origin 제한 |

### 5-2. 무결성 이중 보장

```
Layer 1: 온체인 contentHash
  → SHA-256(canonical JSON) → bytes32
  → 관리자도 변경 불가 (블록체인 불변)

Layer 2: IPFS CID
  → CID 자체가 콘텐츠 해시
  → 데이터 변경 → CID 변경 → 참조 불일치
  
검증: SHA-256(복호화된 평문) == 온체인 contentHash?
  → 불일치 시 위변조 탐지
```

### 5-3. 결제 보안

| 위협 | 대응 |
|------|------|
| Replay | quoteId 일회성 + TTL + consumed_at |
| 이중 청구 | txHash idempotency (ledger 중복 체크) |
| Receipt 위조 | HMAC-SHA256 (RECEIPT_SECRET) + DB 검증 |
| 선점 (front-running) | operator만 attest 가능 → MEV 무관 |

---

## 6. 향후 개발 남은 항목

### 6-1. 현재 착수 필요 (Phase 2-3 잔여)

| 항목 | 설명 | 예상 난이도 |
|------|------|------------|
| **스팸/저품질 방지** | AI 콘텐츠 필터 + 신고 시스템 + 신뢰등급 | 중 |
| **토큰 효율성 데이터 수집** | 비교 실험 (baseline vs proofweave) + 통계 API | 중 |
| **프론트엔드 다듬기** | 반응형, Toast, Explorer 상세, 차트 연동 | 하~중 |

### 6-2. Phase 4: 정리 항목

| 항목 | 설명 |
|------|------|
| 보안 점검 | API Key 미인증, operator 위조, 잔액 부족, 암호화 우회 |
| API 문서 | OpenAPI 3.0 스펙 생성 (swagger) |
| 아키텍처 다이어그램 | 발표/논문용 고품질 다이어그램 |
| 데모 영상 | 전체 흐름 (등록 → 검색 → 결제 → 조회) 녹화 |
| 논문 초안 | contribution, related work, architecture, evaluation |

### 6-3. 후속과제 (Post-MVP)

| # | 항목 | 우선순위 | 설명 |
|---|------|---------|------|
| 1 | **Rust CLI Agent A/B** | 중 | 생산자/소비자 데모 CLI (후속과제로 분리) |
| 2 | Merkle batch attestation | 중 | 여러 attestation을 1개 root로 묶어 가스비 절약 |
| 3 | ERC-20 결제 | 중 | 다양한 토큰 결제 지원 |
| 4 | UUPS 멀티시그 전환 | 중 | Gnosis Safe + TimelockController |
| 5 | Commit-reveal | 하 | 선점 증명 강화 (프론트러닝 방지) |
| 6 | Arweave 이중 저장 | 하 | IPFS pin 소실 대비 영구 백업 |
| 7 | 필드 마스킹 (ZK) | 하 | 일부 필드만 공개 |

> ※ 당초 기획의 Rust 컴포넌트(canonical-json-hasher, AES CLI, 인덱서)는 TypeScript로 대체 구현 완료. Rust CLI Agent만 후속과제로 남음.

---

## 7. 알려진 기술 부채

| # | 항목 | 현재 상태 | 이상적 상태 |
|---|------|----------|------------|
| 1 | Rate limit | 인메모리 Map | Redis 기반 (수평 확장 대비) |
| 2 | AI daily limit | 인메모리 Map | DB 기반 (서버 재시작 시 리셋됨) |
| 3 | 이벤트 인덱서 | API가 직접 waitForTransactionReceipt | 별도 인덱서 프로세스 |
| 4 | Canonical JSON | TypeScript `json-stable-stringify` | Rust CLI (결정적 해싱 규격 강화) |
| 5 | 테스트 | 컨트랙트 33개 + API 21개 | E2E 통합 테스트 추가 필요 |
| 6 | 로깅 | console.log/warn | 구조화된 로깅 (Winston/Pino) |
| 7 | CORS | 하드코딩 origin | env 기반 동적 origin |

---

## 8. 의존성 버전 정리

### API (`api/package.json`)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| express | 5.2.1 | HTTP 서버 |
| viem | 2.47.12 | EVM 상호작용 |
| @coinbase/cdp-sdk | 1.47.0 | Smart Wallet |
| @supabase/supabase-js | 2.103.0 | DB + Auth |
| @x402/express | 2.9.0 | 결제 게이트 |
| @google/genai | 1.49.0 | Gemini AI |
| pinata | 2.5.5 | IPFS |
| zod | 4.3.6 | 스키마 검증 |
| json-stable-stringify | 1.3.0 | Canonical JSON |
| pg | 8.20.0 | PostgreSQL |
| dotenv | 17.4.1 | 환경변수 |
| tsx | 4.21.0 | TS 실행 (dev) |
| vitest | 4.1.4 | 테스트 |
| typescript | 6.0.2 | 컴파일러 |

### Frontend (`web/package.json`)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| react | 19.2.4 | UI |
| react-dom | 19.2.4 | DOM |
| react-router-dom | 7.14.0 | 라우팅 |
| @tanstack/react-query | 5.99.0 | 서버 상태 |
| @supabase/supabase-js | 2.103.0 | Auth |
| recharts | 3.8.1 | 차트 |
| lucide-react | 1.8.0 | 아이콘 |
| react-json-view-lite | 2.5.0 | JSON 뷰어 |
| vite | 8.0.4 | 번들러 |
| typescript | 6.0.2 | 타입체크 |

### Smart Contract

| 패키지 | 용도 |
|--------|------|
| forge-std | Foundry 표준 라이브러리 |
| openzeppelin-contracts | ERC1967Proxy |
| openzeppelin-contracts-upgradeable | UUPS 기본 클래스 |
