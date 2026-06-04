<p align="center">
  <h1 align="center">ProofWeave</h1>
  <p align="center">
    <strong>AI 에이전트 생성 데이터의 온체인 출처 증명 + 결제 프로토콜</strong>
  </p>
  <p align="center">
    <a href="https://proofweave.vercel.app">Demo</a> ·
    <a href="#architecture">Architecture</a> ·
    <a href="#getting-started">Getting Started</a> ·
    <a href="#api-reference">API Reference</a> ·
    <a href="#benchmark">Benchmark</a>
  </p>
</p>

---

## Overview

**ProofWeave**는 AI 에이전트가 생성한 데이터의 **출처(provenance)를 온체인에 기록**하고, 다른 에이전트가 이를 **검증 후 결제하여 사용**할 수 있는 프로토콜입니다.

### 핵심 가치

| 가치 | 설명 |
|------|------|
| **AI 데이터 무결성** | 데이터가 언제, 어떤 모델에 의해 생성됐고, 등록 이후 위변조되지 않았음을 온체인 기록으로 보장 |
| **에이전트 결제 프로토콜** | 에이전트가 프로그래매틱하게 데이터를 검증하고 결제 — HTTP 호출 또는 `proofweave` CLI 한 줄로 완결 |
| **생산자 수익 정산** | 결제금은 온체인 **Creator Vault**에 생산자별로 적립 → 생산자가 직접 claim (운영자 custody 아님) |
| **토큰 효율성** | 같은 근거를 원본 번들 대신 큐레이션된 artifact로 주면 **입력 컨텍스트 ~60% 절감**(3모델 live 실측, [Benchmark](#benchmark) 참조) |

### 차별화

| 비교 대상 | ProofWeave 차이점 |
|-----------|-------------------|
| C2PA | 중앙 CA 의존 → ProofWeave는 탈중앙 온체인 |
| EAS | 범용 attestation, 결제 없음 → ProofWeave는 결제 + 생산자 정산 통합 |
| x402 | 결제만 지원 → ProofWeave는 provenance + 결제 + 정산 통합 |

---

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   Frontend (Web)        │────▶│   Backend (API)      │────▶│  Base Sepolia     │
│   React + Vite + TS     │     │   Express + TS       │     │  (Smart Contract) │
│   Vercel                │     │   GCP Cloud Run      │     │  UUPS Proxy       │
└─────────────────────────┘     └──────────┬───────────┘     │  Registry + Vault │
                                           │                 └──────────────────┘
┌─────────────────────────┐                │
│   CLI (proofweave)      │────────────────┤
│   Claude Code hooks     │     ┌──────────┼────────────┐
│   + artifact transport  │     ▼          ▼            ▼
└─────────────────────────┘  ┌──────────┐ ┌──────────┐ ┌──────────┐
                             │ Supabase │ │  Pinata  │ │  Coinbase│
                             │ Postgres │ │  (IPFS)  │ │  CDP     │
                             │ + Auth   │ │          │ │ (Wallet) │
                             └──────────┘ └──────────┘ └──────────┘
```

웹과 CLI는 동일한 백엔드 API를 공유합니다. 차이는 **신원/지갑**뿐입니다 — 웹 유저는 CDP Smart Wallet, CLI 유저는 본인 EOA를 creator로 사용합니다.

### 핵심 흐름: Register → Attest → Search → Pay → Access → Claim

```mermaid
sequenceDiagram
    participant Owner as 에이전트 소유자
    participant AgentA as Agent A (생산자)
    participant API as ProofWeave API
    participant IPFS as IPFS (Pinata)
    participant Chain as Base Sepolia
    participant AgentB as Agent B (소비자)

    rect rgb(40, 40, 60)
    Note over Owner, Chain: 사전 준비
    Owner->>API: POST /auth/register → API Key 발급
    Note right of API: CDP Smart Wallet 자동 생성
    end

    rect rgb(40, 50, 40)
    Note over AgentA, Chain: 데이터 등록 (Attest)
    AgentA->>API: POST /attest (원본 데이터 + API Key)
    API->>API: Canonical JSON → SHA-256 → contentHash
    API->>API: V2 Envelope Encryption (DEK → AES-GCM → KEK wrap)
    API->>IPFS: 암호문 + wrappedDEK 업로드
    API->>Chain: attest(contentHash, creator, aiModel, ipfsCid)
    API->>API: Gemini 메타데이터 추출 (비동기)
    API-->>AgentA: attestationId + txHash
    end

    rect rgb(40, 60, 40)
    Note over AgentB, Chain: 검색 → 결제 → 사용
    AgentB->>API: GET /search?q=defi+security&domain=DeFi
    API-->>AgentB: attestation 목록 (메타데이터 포함)
    AgentB->>API: GET /attestations/{id}/detail
    API-->>AgentB: 402 Payment Required (x402)
    Note right of API: Smart Wallet에서 USDC 자동 결제
    API->>Chain: USDC 결제 → Creator Vault에 생산자별 적립
    API->>API: AccessReceipt 발급
    API->>API: V2: DEK 언래핑 → 데이터 복호화
    API-->>AgentB: 200 OK + 평문 데이터
    end

    rect rgb(60, 50, 40)
    Note over AgentA, Chain: 수익 정산 (Claim)
    AgentA->>API: GET /claims/me (적립 잔액 조회)
    API->>Chain: claimableBalance(creator) 온체인 read
    API-->>AgentA: DB 누적 + 온체인 claimable
    AgentA->>Chain: claimCreatorBalance(amount, to)
    Note right of Chain: 웹=CDP 위임 UserOp / CLI=EOA 직접 서명
    end
```

### 3계층 결제 아키텍처 (x402 호환)

| Layer | 역할 |
|-------|------|
| **Layer 1: x402 미들웨어** | 유료 리소스 요청 시 402 응답 생성, 결제 검증 |
| **Layer 2: ProofWeave Access Layer** | AccessReceipt 발급/검증, 재결제 방지, Delegated Pay |
| **Layer 3: 상세 데이터 장벽** | Envelope Encryption → DEK 언래핑 → 평문 반환 |

---

## Creator Vault & Claim

결제금이 플랫폼에 고이지 않고 **생산자에게 귀속**되도록, 레지스트리 컨트랙트에 정산용 Vault를 통합했습니다 (동일 UUPS 프록시).

| 단계 | 동작 |
|------|------|
| **적립 (Deposit)** | 소비자 결제 시 백엔드가 `depositForAttestation(attestationId, creator, amount, receiptRef)` 호출 → 해당 attestation의 온체인 creator에게 USDC 적립 |
| **중복 방지** | `receiptRef`(영수증 참조)가 이미 크레딧되면 `ReceiptAlreadyCredited` revert — 같은 결제가 두 번 적립되지 않음 |
| **출처 검증** | 컨트랙트가 온체인 attestation의 creator와 백엔드가 넘긴 creator를 대조 → 변조된 DB row가 엉뚱한 주소로 적립 불가 |
| **정산 (Claim)** | 생산자가 `claimCreatorBalance(amount, to)`로 본인 적립금 인출. **본인만** 인출 가능 (`msg.sender` 기준) |

### 비custodial 원칙

claim은 **운영자가 대신 보관/집행하지 않습니다.**

- **웹 유저**: creator = 본인 CDP Smart Wallet. claim은 백엔드가 그 Smart Wallet 명의로 **위임 UserOp(ERC-4337)**를 구성해 실행 — 키와 자금은 유저 지갑에 귀속. (`POST /claims/execute`)
- **CLI/EOA 유저**: creator = 본인 EOA. 백엔드 실행 경로 없이 **본인 지갑으로 `claimCreatorBalance`를 직접 서명**.

creator 주소는 항상 인증 신원에서 유도되며 클라이언트가 임의 지정할 수 없습니다 — 따라서 본인 잔액만 조회/claim 가능합니다.

---

## Encryption Architecture

### 현재 구현: V2 Envelope Encryption (봉투 암호화)

기존 V1(HKDF 단일 마스터 키) 구조의 문제를 해결하기 위해 **봉투 암호화(Envelope Encryption)**를 도입했습니다.

**V1의 문제**: 서버에 마스터 키가 1개 있고, 이 키에서 모든 attestation의 암호화 키를 수학적으로 파생(HKDF). 마스터 키가 유출되면 전체 데이터 노출. 마스터 키 교체 시 IPFS에 저장된 모든 암호문을 재암호화해야 함.

**V2의 해결**: attestation마다 **독립적인 랜덤 키(DEK)**를 생성. 이 DEK를 마스터 키(KEK)로 **감싸서(wrap)** 저장. 마스터 키 교체 시 **포장지(wrappedDEK)만 재생성** — IPFS 데이터는 그대로.

```
[등록 시]
1. DEK = 32바이트 랜덤 생성 (attestation별 고유)
2. ciphertext = AES-256-GCM(data, DEK)
3. wrappedDEK = AES-256-GCM(DEK, KEK)   ← 마스터 키로 DEK 래핑
4. IPFS에 { ciphertext + wrappedDEK } 업로드

[조회 시]
1. IPFS에서 { ciphertext + wrappedDEK } 다운로드
2. DEK = AES-256-GCM⁻¹(wrappedDEK, KEK)  ← 마스터 키로 DEK 복원
3. plaintext = AES-256-GCM⁻¹(ciphertext, DEK)
```

### V1 하위 호환

기존 V1(HKDF) 데이터는 DB의 `encryption_version` 컬럼으로 구분. 조회 시 자동 분기 처리되어 기존 데이터도 정상 복호화됩니다.

### 향후 업그레이드: 완전 E2E 암호화

현재는 서버가 KEK를 보유하여 복호화 가능한 구조입니다. 향후 Agent가 자체 키로 암호화하고, 구매 시 키를 직접 교환하는 **Zero-Knowledge 서버 구조**로 업그레이드할 수 있습니다. (설계 완료, 구현 미정)

---

## Metadata Pipeline (T3)

등록된 데이터에 자동으로 **메타데이터(title, domain, keywords, abstract 등)**를 부착하는 시스템입니다.

| 단계 | 설명 |
|------|------|
| **규칙 기반 추출** | 언어 감지, 입출력 구조 분석, 포맷 판별, 코드 존재 여부 (동기, 실패 없음) |
| **LLM 보강** | Gemini Flash로 title, domain, problemType, keywords, abstract 추출 (비동기, 실패 시 fallback) |
| **PII 보호** | 이메일/지갑 주소/API 키 자동 마스킹, 등록자 식별자 pseudonymize |

### 메타데이터 상태

| `metadata_status` | 의미 |
|-------------------|------|
| `legacy` | T3 이전 등록 데이터 (메타데이터 없음) |
| `pending` | 규칙 기반 추출 완료, LLM 보강 대기 중 |
| `ready` | LLM 보강 완료, 모든 메타데이터 사용 가능 |
| `failed` | LLM 호출 실패 (규칙 기반만 존재) |

---

## Tech Stack

| 영역 | 기술 | 설명 |
|------|------|------|
| **Smart Contract** | Solidity 0.8.28 + Foundry + OpenZeppelin | UUPS Proxy, Registry + Creator Vault, Base Sepolia |
| **Backend API** | Express + TypeScript + viem | x402 결제 게이트, IPFS, 온체인 tx, Vault 정산 |
| **Frontend** | React 19 + Vite + TypeScript | SPA, Supabase Auth, Explorer 카드/테이블 뷰, Claims |
| **CLI** | TypeScript (npm `proofweave`) | Claude Code hook 하니스 + artifact 게시/구매/설치 |
| **Database** | Supabase (PostgreSQL) | attestations, api_keys, 결제 원장, claim 내역, 메타데이터 |
| **Storage** | Pinata (IPFS) | 암호화된 데이터 분산 저장 (V1/V2 페이로드) |
| **Wallet** | Coinbase CDP (ERC-4337) | 에이전트용 Smart Account 자동 결제 + 위임 claim |
| **AI** | Gemini 멀티모델 | 메타데이터 추출 + AI 분석 (모델별 일일 한도) |
| **Crypto** | AES-256-GCM + Envelope Encryption | V2: attestation별 DEK + KEK 래핑 |
| **Deploy** | Vercel (Frontend) + GCP Cloud Run (API) | Docker 멀티스테이지 빌드 |

---

## Project Structure

```
proofweave/
├── src/                          # Smart Contracts (Solidity)
│   └── AttestationRegistry.sol   #   UUPS Proxy — provenance 레지스트리 + Creator Vault
├── test/                         # Contract Tests (Foundry, 38 tests)
│   ├── unit/                     #   Attest, Verify, AccessControl, Vault
│   └── upgrade/                  #   UUPS 업그레이드 테스트
├── script/                       # Deployment Scripts
│   ├── Deploy.s.sol              #   ERC1967Proxy + initialize
│   └── UpgradeVault.s.sol        #   Vault 정산 기능 UUPS 업그레이드
├── api/                          # Backend API (TypeScript)
│   ├── src/
│   │   ├── config/               #   환경변수, 체인 설정, CDP, Keychain
│   │   ├── contracts/            #   ABI + 온체인 read/write (attest, vault)
│   │   ├── db/                   #   마이그레이션 (자동 스키마 업데이트)
│   │   ├── middleware/           #   authenticate, rateLimit, x402Gate
│   │   ├── routes/               #   auth, attest, attestations, ai, pricing,
│   │   │                         #     wallet, stats, purchases, claims,
│   │   │                         #     prompt-history, taint, health
│   │   ├── services/             #   attestation, crypto, ipfs, metadata,
│   │   │                         #     sanitize, receipt, ledger, wallet
│   │   ├── __tests__/            #   vitest 라우트 테스트
│   │   └── types/                #   TypeScript 타입 정의
│   └── Dockerfile                #   멀티스테이지 프로덕션 빌드
├── web/                          # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/           #   AppLayout, AttestationCard, PurchaseModal,
│   │   │                         #     FilterPickerModal, MyDataSection, admin/
│   │   ├── contexts/             #   AuthContext (Supabase → API Key 발급)
│   │   ├── pages/                #   Landing, Login, Dashboard, Attest, Explorer,
│   │   │                         #     Analytics, Claims, Settings, Admin
│   │   └── lib/                  #   API 클라이언트, Supabase 클라이언트
│   └── vercel.json               #   SPA 라우팅 + 캐시 설정
├── cli/                          # ProofWeave CLI (npm `proofweave`)
│   ├── src/                      #   args, http, config, artifacts, claudeHooks
│   └── hooks/                    #   Claude Code hook 진입점
├── experiments/                  # 토큰효율 벤치마크 하니스
│   └── token-efficiency/         #   fixtures + live 실측 runner + 집계 스크립트
├── docs/                         # 설계 + 증거 문서
│   └── evidence/                 #   벤치마크 실측 산출물 (FINAL 보고서 등)
├── supabase/                     # DB 마이그레이션 (reputation, vault settlement)
├── 참조/                          # 설계 문서 & 레퍼런스 (spec, x402, EAS)
├── deploy.sh                     # API(Cloud Run) 배포 스크립트
├── run.sh                        # API + Web 동시 실행 스크립트
└── foundry.toml                  # Foundry 설정
```

---

## Smart Contract

### AttestationRegistry.sol

> AI 에이전트가 생성한 데이터의 출처를 온체인에 기록하고, 생산자 수익을 정산하는 레지스트리 + Vault

- **패턴:** UUPS Proxy (OpenZeppelin Upgradeable)
- **네트워크:** Base Sepolia
- **Proxy 주소:** `0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E` (Registry + Vault, 동일 프록시)
- **결제 토큰:** USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

#### Provenance

| 함수 | 권한 | 설명 |
|------|------|------|
| `attest()` | onlyOperator | 데이터 출처 등록 (contentHash, creator, aiModel, offchainRef) |
| `verify()` | public view | contentHash + creator로 attestation 조회 |
| `getAttestation()` | public view | attestationId로 조회 |
| `getCreatorAttestations()` | public view | creator의 attestationId 목록 |
| `setOperator()` | onlyOwner | API 서버 지갑 주소 변경 |

**중복 방지:** `keccak256(contentHash + creator)` — 같은 creator가 같은 데이터를 두 번 등록하면 `AlreadyAttested` revert

#### Creator Vault (정산)

| 함수 | 권한 | 설명 |
|------|------|------|
| `depositForAttestation()` | public | 결제 USDC를 attestation의 온체인 creator에게 적립 (receiptRef 멱등) |
| `claimCreatorBalance()` | creator 본인 | 적립금 인출 — `msg.sender` 기준, 타인 잔액 인출 불가 |
| `claimableBalance()` | public view | creator의 현재 인출 가능 잔액 |
| `isReceiptCredited()` | public view | 해당 영수증이 이미 적립됐는지 |

**안전장치:** `_authorizeUpgrade`는 onlyOwner, `renounceOwnership`은 revert(소유권 영구 포기 차단), Vault 함수는 `nonReentrant` 가드.

---

## API Reference

### Authentication

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/register` | POST | Wallet Signature (EIP-191) | API Key 발급 + CDP Smart Wallet 생성 |
| `/auth/register-web` | POST | Supabase JWT | 웹 유저 → API Key 발급 |
| `/auth/rotate` | POST | API Key | 기존 키 무효화 + 새 키 발급 |

### Core

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/attest` | POST | API Key | 데이터 등록 (V2 봉투 암호화 → IPFS → 온체인 tx → 메타데이터 자동 추출) |
| `/search` | GET | API Key | attestation 검색 (q, domain, problemType 필터, 페이지네이션) |
| `/search/facets` | GET | API Key | 검색 필터 옵션 동적 조회 (DB 기반 domain/problemType 목록 + 건수) |
| `/attestations/:id` | GET | API Key | 기본 정보 조회 (무료) |
| `/attestations/:id/detail` | GET | API Key | 상세 조회 (유료 → x402 → 복호화 → 평문 반환) |
| `/verify/:contentHash` | GET | API Key | 온체인 무결성 검증 |

### Payment (x402)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/pricing` | POST | API Key | 가격 정책 설정 (creator만) |
| `/pricing/:id` | GET | Public | attestation 가격 조회 |
| `/wallet/balance` | GET | API Key | Smart Wallet USDC 잔고 |
| `/wallet/address` | GET | API Key | Smart Wallet 주소 |

### Creator Claim

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/claims/me` | GET | API Key | 내 수익 현황 (DB 누적 + 온체인 claimable 잔액 — 별개 필드로 분리) |
| `/claims/execute` | POST | API Key | 웹 유저 전용: Smart Wallet 위임 claim 실행 (CLI/EOA는 직접 서명) |
| `/claims/history` | GET | API Key | 내 claim 실행 내역 (최신순) |

### AI Analysis

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/ai/models` | GET | API Key | 사용 가능 모델 목록 + 잔여 횟수 조회 |
| `/ai/analyze` | POST | API Key | Gemini 멀티모델 분석 (모델별 일일 한도) |

### Stats, Purchases & Misc

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/stats/me` | GET | API Key | 내 통계 (등록 수, 구매 수, 절감 추정 등) |
| `/purchases/mine` | GET | API Key | 내가 구매한 attestation ID 목록 |
| `/purchases/history` | GET | API Key | 구매 내역 (금액, txHash, 날짜) |
| `/prompt-history` | GET / DELETE | API Key | attest 채팅 세션 기록 조회/삭제 |
| `/taint/evaluate` | POST | API Key | 입력 컨텍스트 오염(taint) 평가 |
| `/health` | GET | Public | 헬스 체크 |

> creator 집계 규칙: 웹 유저(`web:` 신원)는 Smart Wallet 주소를, CLI/EOA 유저는 본인 EOA를 creator로 사용합니다. `/stats/me`, `/pricing`, `/claims/*`가 동일 규칙을 공유합니다.

---

## Database Schema

핵심 테이블 (Supabase PostgreSQL):

| 테이블 | 역할 |
|--------|------|
| `attestations` | 온체인 attestation 데이터 + 메타데이터 + 암호화 버전 |
| `api_keys` | API Key 해시 + 지갑 주소 + Smart Wallet 주소 |
| `consumed_signatures` | EIP-191 서명 리플레이 방지 |
| `access_receipts` | x402 결제 영수증 (HMAC 서명) |
| `pricing_policies` | attestation별 가격 정책 (USD micros) |
| `payments_ledger` | 결제 이력 원장 (txHash, amount, method) |
| `claim_history` | 생산자 claim 실행 내역 (amount, recipient, txHash) |
| `quotes` | x402 결제 견적 (일회성, TTL) |

---

## CLI

`proofweave`는 Claude Code hook 하니스이자 artifact 전송 CLI입니다. hook은 이 CLI를 호출하고, CLI는 로컬 설정(`~/.proofweave/config.json`)에서 API 키를 읽으므로 **Claude 설정 파일에 API 키가 노출되지 않습니다.**

```sh
# Claude Code hook 설치 (idempotent)
proofweave install --target claude-code

# API 인증
proofweave auth login --api-key <key> --api-base-url http://localhost:3001

# 게시 — 단일 POST /attest. JSON은 그대로, SKILL.md/프롬프트는 구조화 JSON으로 래핑
proofweave publish ./artifact.json --ai-model claude-3-5-sonnet --price-usd-micros 250000

# 검색 → 구매 → 설치
proofweave search "extract structured data from PDF receipts"
proofweave buy <attestation-id>
proofweave install-artifact <attestation-id>   # .claude/skills/<slug>/SKILL.md

# 진단 (CI에서 사용 가능 — FAIL 시 non-zero exit)
proofweave doctor
```

구매한 영수증/artifact는 `~/.proofweave/` 아래에 캐시되어 재결제를 방지합니다.

---

## Getting Started

### Prerequisites

- Node.js 22+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- Git

### Environment Setup

```bash
# 1. Clone
git clone [repo-url] && cd proofweave

# 2. Environment variables
cp .env.example .env
# .env 파일에 시크릿 값 입력 (Supabase, Pinata, Gemini, CDP 등)
# 비밀값은 macOS Keychain(account: proofweave)에서 런타임 로드 가능

# 3. Contract dependencies
forge install

# 4. API setup
cd api && npm install

# 5. Frontend setup
cd ../web && npm install
```

### Run Locally

```bash
# 통합 실행 (권장)
./run.sh
# → API: http://localhost:3001
# → Web: http://localhost:5173

# 또는 개별 실행
cd api && npm run dev   # API
cd web && npm run dev   # Frontend
```

### Smart Contract

```bash
# Build
forge build

# Test (38 tests)
forge test -vvv

# Deploy to Base Sepolia
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast

# Vault 정산 기능 업그레이드 (UUPS)
forge script script/UpgradeVault.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

### Deploy API

```bash
# Cloud Run 배포 (.env → env 주입, Supabase 키 유효성 사전 검증, 헬스/라우트 확인)
./deploy.sh api
```

---

## Benchmark

ProofWeave의 토큰 효율 주장을 **live API 실측**으로 검증했습니다. 핵심 주장: *"원본 소스 번들 대신 큐레이션된 artifact를 컨텍스트로 주면 같은 답을 더 적은 입력으로 낸다."*

같은 42개 쿼리에 대해 raw(원본 번들) vs artifact(압축본)를 **paired**로 비교 — single-shot, cache/tool off, temperature 0, provider usage 원본 보존.

| 지표 | GPT | Gemini | Claude |
|------|---:|---:|---:|
| **입력(컨텍스트) 절감** | **59.5%** | **60.5%** | **59.9%** |
| 총토큰 절감 | 48.2% | 35.7% | 45.6% |
| 비용 절감(상대) | 28.3% | 24.5% | 35.5% |
| 답변 품질 회귀 | none | none | none |

> **읽는 법:** 입력 컨텍스트는 3모델 모두 ~60% 감소하며, 답변 품질은 동등(환각 0)합니다. 총토큰·비용 절감은 그보다 작고 모델의 출력 구조에 의존합니다.
>
> 측정은 저비용 티어 모델로 수행했으며(발표용 플래그십 라벨과 분리), 실제 API 청구 **금액은 비공개**(절감률 %만 공개)입니다. 1차 OpenCode 시도는 agent harness 오염으로 폐기됐고 인용하지 않습니다.

검색(retrieval) offline 결과: Hit@3 **94.44%**, MRR **0.819**, no-match precision/recall **100%**. 단, 검색 폭을 k=5까지 넓히면 추가 정답이 없어 컨텍스트만 +38% 증가합니다.

📄 전체 방법론·원자료: [`docs/evidence/benchmark-smoke-2026-06-01/FINAL-benchmark-report.md`](docs/evidence/benchmark-smoke-2026-06-01/FINAL-benchmark-report.md)

---

## Security

| 위협 | 대응 |
|------|------|
| 결제 우회 (IPFS 직접 접근) | AES-256-GCM 암호화 — 복호화 키는 서버만 보유 |
| 마스터 키 유출 | V2 Envelope: attestation별 독립 DEK → KEK만 교체하면 wrappedDEK 재래핑 |
| Replay attack | quoteId 일회성 + TTL, consumed_signatures |
| AccessReceipt 위조 | HMAC-SHA256 서명 + DB 검증 |
| API Key 유출 | `/auth/rotate`로 즉시 무효화, Key 해시만 DB 저장 |
| 온체인 무단 등록 | `onlyOperator` modifier — API 서버 지갑만 tx 가능 |
| 수익 탈취 (타 creator claim) | `claimCreatorBalance`는 `msg.sender` 기준 — 본인 적립금만 인출 |
| 결제 중복 적립 | Vault `receiptRef` 멱등 — 같은 영수증 재적립 시 revert |
| IPFS 데이터 조작 | CID 자체가 콘텐츠 해시 — 변조 시 CID 불일치 |
| PII 노출 | T3 sanitize: 이메일/지갑/API키 자동 마스킹 + pseudonymize |

---

## Deployment

| 서비스 | 플랫폼 | URL |
|--------|--------|-----|
| Frontend | Vercel | `https://proofweave.vercel.app` |
| API | GCP Cloud Run | Docker 멀티스테이지 빌드 (`./deploy.sh api`) |
| Database | Supabase | PostgreSQL + RLS |
| Smart Contract | Base Sepolia | Proxy: `0x758F...2e8E` |

---

## Roadmap

### ✅ Completed

- [x] **Phase 0-1**: 프로젝트 기획, AttestationRegistry.sol (UUPS Proxy), Base Sepolia 배포
- [x] **Phase 2**: API 서버 핵심 (Auth, Attest, x402 결제 게이트, CDP Smart Wallet)
- [x] **T1**: 다운로드 + 결제 시스템, 운영 안정성 + 보안 수정
- [x] **T2**: 검색 시스템 고도화 (q 패턴 감지, 페이지네이션)
- [x] **T3**: 메타데이터 매니페스트 시스템 (PII 보호, Gemini 메타데이터 추출)
- [x] **T4**: Explorer 시각화 (AttestationCard, 동적 필터, 카드/테이블 뷰, 글로벌 검색)
- [x] **T5**: Envelope Encryption (V2 봉투 암호화, DEK/KEK 분리, V1 하위 호환)
- [x] **Creator Vault**: 온체인 정산 (deposit/claim, receiptRef 멱등, 비custodial claim)
- [x] **CLI**: `proofweave` npm 하니스 (Claude Code hook + artifact 게시/구매/설치)
- [x] **Benchmark**: 토큰효율 3모델 live 실측 (입력 ~60% 절감, 품질 동등)

### 📋 Planned

- [ ] **Mock/미동작 흐름 감사** (Settings 가격 설정, Dashboard KPI 실데이터 등)
- [ ] 보안 점검 + 논문 초안 + 데모 영상

### 🔮 후속과제 (Post-MVP)

- [ ] 완전 E2E 암호화 (Zero-Knowledge 서버 — 설계 완료, 구현 미정)
- [ ] Merkle batch attestation, ERC-20 결제, 멀티시그

---

## License

MIT

---

## Team

캡스톤 디자인 (AI + 블록체인)
