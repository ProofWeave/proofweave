# Plan 3 - UI/UX Redesign Planning With Codex

## Purpose

ProofWeave UI/UX 전면 변경 전에 현재 `web/` 구조, Claude Design 랜딩 초안, claim/benchmark 후속 작업을 모두 반영한 실행 계획을 먼저 확정한다.

이번 문서는 구현 계획이다. 아직 코드를 수정하지 않는다. 사용자가 Claude Design 링크를 가져오면 Claude Code가 해당 디자인을 먼저 분석하고, Codex는 그 결과를 기준으로 landing과 app 내부 화면을 같은 제품처럼 보이게 구현한다.

## Non-goals

- 이번 단계에서 실제 UI 구현을 시작하지 않는다.
- claim 기능 자체를 구현하지 않는다.
- benchmark live test를 수행하지 않는다.
- 문서/README 정리는 나중에 한다.
- 근거 없는 숫자, 과장 카피, 발표용 표현을 추가하지 않는다.

## Owner And Tool Split

| Workstream | Owner | Output |
|---|---|---|
| Claude Design link intake | Claude Code | 디자인 URL, screenshot, token/style notes, landing component inventory |
| UI/UX implementation plan | Codex | 이 문서와 승인용 화면별 와이어프레임 |
| Claim API/tx design | Claude ultracode | `/claims` API/UI 계약 초안 |
| Benchmark live/proxy test | OpenCode | 사용 가능한 metric과 usage source audit |
| Implementation after approval | Codex or OpenCode | web UI 변경 |
| Review | Claude ultracode | 과장 claim, IA, payout/benchmark 정확성 리뷰 |
| Final QA | Codex | build, lint, browser QA |

## Claude Design Intake Plan

Claude Design 링크가 도착하면 바로 구현하지 않고 다음 산출물을 먼저 만든다.

1. 랜딩 첫 화면 screenshot과 주요 section screenshot을 저장한다.
2. 색상, typography, spacing, border, card, button, nav, visual motif를 추출한다.
3. 현 checkout의 `LandingPage.tsx`와 비교해서 유지/대체/삭제 항목을 표로 만든다.
4. landing에만 있는 장식 요소와 app 내부까지 가져가야 할 제품 언어를 분리한다.
5. app 내부에 적용할 최소 design token set을 확정한다.
6. Claude Design에 metric이나 과장 문구가 있으면 근거 확인 전에는 제거하거나 disabled placeholder로 바꾼다.

Claude Code에게 줄 요청은 다음 형식이 좋다.

```text
Claude Design 링크를 열어서 ProofWeave landing design을 분석해줘.

산출물:
1. 첫 화면과 주요 섹션 screenshot 요약
2. 디자인 토큰: 배경, surface, border, text, accent, button, card, chart에 쓸 색상
3. 현재 web/src/pages/LandingPage.tsx와 비교한 유지/삭제/대체 목록
4. app 내부 페이지까지 가져가야 할 디자인 언어
5. 근거 없는 숫자/과장 카피 목록
6. 구현자가 바로 쓸 수 있는 section 구조와 component notes

주의:
- 구현하지 말고 분석만 해줘.
- landing hero의 과장 표현을 app 내부로 가져오지 마.
- 숫자는 evidence 없으면 사용 금지.
```

## Current Web Inventory

현재 route는 `web/src/App.tsx` 기준이다.

```text
Public:
  /
    auth 상태에 따라 /dashboard 또는 /landing redirect
  /landing
  /login
  /auth/callback

Protected:
  /dashboard
  /attest
  /explorer
  /analytics
  /settings
  /admin

Missing:
  /claims
```

현재 protected route는 `AppLayout` 하나에 의존한다. `AppLayout`은 sidebar, mobile menu, Cmd+K modal, sign out, user badge를 담당한다. `/claims`를 추가하려면 route, sidebar nav, Cmd+K quick navigation을 같이 수정해야 한다.

현재 CSS는 `web/src/index.css`에 거의 모든 스타일이 모여 있다. 파일 상단은 `Warm Light Theme`이며, 실제 색상은 warm cream/rose/burgundy 쪽이다. 하지만 목표 디자인은 Claude Design의 dark/cyan institutional marketplace 쪽이므로 token 재정의가 먼저 필요하다.

현재 주요 화면 책임은 다음과 같다.

| Screen | Current responsibility | Current issue |
|---|---|---|
| Landing | public CTA, feature intro | Claude Design dark/cyan과 현재 warm organic theme가 충돌 가능 |
| Dashboard | 30일 domain timeline, recent attestations | 운영 overview로는 좋지만 product status 요약이 부족 |
| Explorer | marketplace search, filters, card/table, purchase modal | buyer decision 정보가 카드/모달에 분산 |
| Attest | AI analysis chat, per-message attest, manual placeholder | tool surface는 있음. empty/copy/metadata 정돈 필요 |
| Analytics | real backend reuse analytics | product analytics와 benchmark evidence가 섞일 위험 |
| Settings | account, API key, smart wallet, charge, MyData, purchase history | 너무 많은 역할이 한 화면에 섞임 |
| PurchaseModal | preview, pricing, payment, receipt, reputation | 기능이 많아 overflow/인지부하 위험 높음 |
| MyDataSection | creator data + price setting | Settings보다 creator/claims 영역으로 이동 후보 |
| DomainTimeline | dashboard chart | dark token 적용만 우선, 로직 변경 위험 낮음 |

## Route And Information Architecture

최종 목표 route map은 다음으로 둔다.

```text
Public:
  /landing
  /login
  /auth/callback

Protected:
  /dashboard
  /explorer
  /attest
  /analytics
  /claims
  /settings
  /admin
```

권장 sidebar 순서:

```text
ProofWeave
  Dashboard
  Explorer
  Attest
  Analytics
  Claims
  Settings

Admin
  Admin Audit
```

Primary flows:

```text
Buyer:
  Landing
  -> Explorer
  -> Artifact preview
  -> Purchase or unlock
  -> Receipt
  -> Reputation

Creator:
  Landing
  -> Attest
  -> Pricing / My Data
  -> Explorer listing
  -> Claims
  -> Claim transaction

Operator:
  Dashboard
  -> Admin Audit
  -> reconciliation / suspicious listings
```

`/claims`는 별도 route로 둔다. Settings 안에 넣으면 payout, wallet funding, API key, purchase history가 섞인다. 단, claim API가 준비되기 전에는 sidebar에 노출하지 않거나 disabled 상태로 노출한다.

## Design Language To Preserve From Claude Design

Claude Design에서 유지할 언어:

- dark institutional marketplace
- cyan/teal provenance network
- premium but functional
- Korean-first copy, selective English product terms
- artifact, provenance, payment, receipt, reputation, claim을 제품 축으로 표현
- landing first viewport에서 ProofWeave가 명확히 보이는 brand signal
- app 내부까지 이어지는 token, border, button, badge, chart tone

App 내부에서 피할 것:

- landing hero와 같은 큰 marketing composition
- 장식용 blob/orb/bokeh
- nested card layout
- 과도한 기능 설명 텍스트
- 증거 없는 metric card
- mobile에서 버튼 안 텍스트가 깨지는 layout

## Design Token Plan

Claude Design 분석 후 정확한 값으로 갱신한다. 우선 구현 기준 token 이름은 다음을 사용한다.

| Token | Purpose |
|---|---|
| `--bg-page` | app 전체 배경 |
| `--bg-shell` | sidebar/nav shell |
| `--surface` | 기본 surface |
| `--surface-raised` | modal, dropdown, focused panel |
| `--surface-muted` | input, table header, secondary block |
| `--border-subtle` | 기본 구분선 |
| `--border-strong` | hover/focus/highlight |
| `--text-primary` | primary text |
| `--text-secondary` | body/label text |
| `--text-muted` | metadata/helper text |
| `--accent-cyan` | primary provenance/action accent |
| `--accent-teal` | secondary trust/data accent |
| `--success` | confirmed/paid/verified |
| `--warning` | pending/mismatch/early sample |
| `--error` | failed/rejected |
| `--chart-1..6` | dashboard/analytics charts |
| `--focus-ring` | keyboard focus |
| `--disabled` | disabled control |

Constraints:

- teal/cyan only UI가 되지 않도록 neutral, amber, green, rose를 보조로 둔다.
- letter spacing은 기본 0으로 둔다. label uppercase가 필요한 곳만 예외적으로 소량 사용한다.
- card radius는 8px 이하를 기본으로 한다. 기존 radius가 커 보이면 줄인다.
- button/icon button은 stable width/height를 둔다.
- long hash, tx id, address는 `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `word-break` 기준을 명확히 둔다.

## Copy And Metric Rules

금지 문구:

- `1.24M+ datasets`
- `100% verifiable`
- `90% cost saving`
- `guaranteed savings`
- `fully decentralized`
- `production-grade audit complete`
- evidence 없이 `live`, `real`, `verified`, `institutional-grade`를 강하게 주장하는 문장

허용 기준:

| Evidence | Landing | Analytics | Notes |
|---|---|---|---|
| Provider usage metadata | 가능 | 가능 | sample size, run date, model 필요 |
| Provider count API | 제한적 | 가능 | billing claim 금지 |
| OpenCode request usage | 금지 | internal/proxy label | session total과 분리 |
| OpenCode session usage | 금지 | 원칙적으로 UI 금지 | benchmark metric 아님 |
| Offline CTT | 금지 | technical detail 가능 | hero metric 금지 |
| Production app usage | 가능 | 가능 | source endpoint 명시 |

숫자 노출 시 필요한 metadata:

```text
value
sample size
query/domain count
model ids or benchmark labels
usage source
run date
quality/no-match handling
```

## Screen Visualizations

아래 와이어프레임은 구현용 최종 디자인이 아니라 approval용 구조 시각화다. Claude Design 링크 분석 후 색상과 visual motif를 맞춘다.

### 1. Landing

```text
+--------------------------------------------------------------------------------+
| ProofWeave                                                Login    Open App     |
|--------------------------------------------------------------------------------|
|                                                                                |
|     PROOFWEAVE                                                                 |
|     Verifiable AI artifact marketplace                                         |
|     AI 분석 결과를 provenance, encrypted access, receipt로 거래합니다.          |
|                                                                                |
|     [Explorer 열기] [Attest 시작]                                               |
|                                                                                |
|     Evidence status: Benchmarking in progress                                   |
|                                                                                |
|                         [Claude Design provenance network visual]               |
|                         nodes / receipt / vault / reputation                    |
|                                                                                |
|--------------------------------------------------------------------------------|
|  Provenance        Encrypted access        x402 payment        Reputation       |
+--------------------------------------------------------------------------------+
```

Landing notes:

- Claude Design 랜딩 section structure를 우선 반영한다.
- metric slot은 증거가 없으면 `Benchmarking in progress` 정도로만 둔다.
- `100%`, `90%`, `1.24M` 같은 숫자가 Claude Design에 있어도 제거한다.
- footer/secondary sections는 제품 pillar만 짧게 보여준다.

### 2. AppLayout

```text
+----------------------+---------------------------------------------------------+
| ProofWeave           | Page title                         [Cmd+K search]     |
| AI Artifact Market   |---------------------------------------------------------|
|                      |                                                         |
| Dashboard            |  Page content                                           |
| Explorer             |                                                         |
| Attest               |                                                         |
| Analytics            |                                                         |
| Claims               |                                                         |
| Settings             |                                                         |
|                      |                                                         |
| Admin Audit          |                                                         |
|----------------------|                                                         |
| user@email     signout|                                                        |
+----------------------+---------------------------------------------------------+
```

Mobile layout:

```text
+--------------------------------------------------+
| [menu] ProofWeave                  [search icon] |
|--------------------------------------------------|
| Page content                                      |
|                                                  |
| Drawer opens over content. No horizontal scroll. |
+--------------------------------------------------+
```

### 3. Dashboard

```text
+--------------------------------------------------------------------------------+
| Dashboard                                                                      |
| Protocol activity and marketplace status                                       |
|--------------------------------------------------------------------------------|
| [Attestations 30d] [Purchases/receipts] [Claim status] [Benchmark status]       |
|--------------------------------------------------------------------------------|
| Activity by domain                                                             |
| [DomainTimeline chart, dark tokens, responsive]                                |
|--------------------------------------------------------------------------------|
| Recent artifacts                                                               |
| Title / Hash              Domain        Model        Date        Action         |
| ...                                                                            |
+--------------------------------------------------------------------------------+
```

Dashboard notes:

- 운영 overview로 둔다.
- marketing hero 금지.
- claim/benchmark는 status summary만 둔다. 상세는 `/claims`, `/analytics`로 보낸다.

### 4. Explorer

```text
+--------------------------------------------------------------------------------+
| Explorer                                                                       |
| Browse verified AI artifacts                                                   |
|--------------------------------------------------------------------------------|
| [Search keyword/hash/address                         ] [Search] [grid|table]    |
| [Domain v] [Type v] [All] [Free] [Paid]                         active filters  |
|--------------------------------------------------------------------------------|
| +----------------------------+ +----------------------------+ +--------------+ |
| | Title                      | | Title                      | | Title        | |
| | domain  type  language     | | domain  type  language     | | badges       | |
| | abstract clamp 2 lines     | | abstract clamp 2 lines     | | abstract     | |
| | keywords...                | | keywords...                | | keywords     | |
| | model   date      price    | | model   date      price    | | model price  | |
| | [Tx] [Preview/Buy]         | | [Tx] [Preview/Buy]         | | [Tx] [Buy]   | |
| +----------------------------+ +----------------------------+ +--------------+ |
|--------------------------------------------------------------------------------|
| Showing N results                                      [Prev] [Next]           |
+--------------------------------------------------------------------------------+
```

Explorer notes:

- buyer decision 정보: title, domain, model, price/free, purchased, trust/reputation summary.
- card height는 지나치게 흔들리지 않게 clamp한다.
- table view는 dense inspection용으로 유지한다.

### 5. Purchase Modal

```text
+--------------------------------------------------------------+
| Data preview / Purchase                                  [x] |
|--------------------------------------------------------------|
| Artifact title                                               |
| [domain] [model] [language] [free/paid] [purchased]           |
| Abstract clamp                                               |
|--------------------------------------------------------------|
| Provenance                                                   |
| Creator  0x12...abcd      Tx  0xab...1234                    |
| Attestation ID  0x...                                        |
|--------------------------------------------------------------|
| Price / Access                                               |
| $0.250000 USDC        [Purchase and unlock]                  |
|--------------------------------------------------------------|
| After unlock:                                                |
| [Receipt] [Basescan] [MD|JSON]                               |
| Data viewer                                                  |
|--------------------------------------------------------------|
| Reputation                                                   |
| verified useful: sample-based only                           |
| [useful] [not useful] [optional note] [Submit]                |
+--------------------------------------------------------------+
```

PurchaseModal notes:

- creator claim 정보는 절대 넣지 않는다.
- payment rail은 buyer에게 필요한 수준으로만 짧게 보여준다.
- reputation ratio는 sample size와 early state가 있을 때만 표시한다.

### 6. Attest

```text
+--------------------------------------------------------------------------------+
| Attest                                                                         |
| Create and publish an AI artifact                                              |
|--------------------------------------------------------------------------------|
| [AI analysis] [Manual import disabled/secondary]                                |
|--------------------------------------------------------------------------------|
| +----------------------------------------------------------------------------+ |
| | conversation area                                                           | |
| |                                                                            | |
| | user prompt                                                                 | |
| | model response                                                              | |
| | [model] [input tokens] [output tokens] [cost] [guard status] [Attest]        | |
| |                                                                            | |
| | empty state: short, not explanatory brochure                                | |
| +----------------------------------------------------------------------------+ |
| | [prompt textarea                                        ] [send icon]        | |
| | [model select] [quota] [new chat]                                            | |
| +----------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------+
```

Attest notes:

- chat UI는 작업 도구로 유지한다.
- 설명 copy는 줄이고 상태와 action 중심으로 정리한다.
- manual tab은 기능 전까지 disabled/secondary로 명확히 둔다.

### 7. Analytics

```text
+--------------------------------------------------------------------------------+
| Analytics                                                                      |
| Product usage and benchmark evidence                                           |
|--------------------------------------------------------------------------------|
| [7d] [30d] [90d] [all]                                                         |
|--------------------------------------------------------------------------------|
| Product usage                                                                 |
| [Saved tokens] [Saved cost] [Unique reuse] [Metered ratio]                      |
| [cost chart]                                [reuse trend chart]                 |
| [model breakdown]                           [recent reuse table]                |
|--------------------------------------------------------------------------------|
| Benchmark evidence                                                             |
| [Usage source: offline CTT / provider metadata / proxy] [Run date]              |
| [input token reduction] [quality pass] [no-match performance]                   |
| [model/domain table] [quality failures]                                         |
+--------------------------------------------------------------------------------+
```

Analytics notes:

- 실제 product usage와 benchmark evidence를 명확히 분리한다.
- offline CTT는 technical detail로만 표시한다.
- no-match와 quality fail은 savings 성공으로 집계하지 않는다.

### 8. Claims

```text
+--------------------------------------------------------------------------------+
| Claims                                                                         |
| Creator earnings and vault claim                                               |
|--------------------------------------------------------------------------------|
| [Claimable USDC] [Gross earned] [Paid receipts] [Reconciled / warning]          |
|--------------------------------------------------------------------------------|
| Wallet and network                                                             |
| Creator wallet  0x...       Connected wallet  0x...       Base Sepolia          |
| [Switch network] [Refresh]                                                      |
|--------------------------------------------------------------------------------|
| Claim                                                                          |
| Amount [             ] [Max]     Recipient [0x...                      ]        |
| [Claim USDC]        pending/success/error tx state                              |
|--------------------------------------------------------------------------------|
| Recent settlements                                                             |
| Receipt        Amount        Vault tx        Status        Date                 |
| ...                                                                            |
+--------------------------------------------------------------------------------+
```

Claims notes:

- DB gross earned와 on-chain claimable은 별도로 보여준다.
- wallet mismatch, wrong network, zero balance, pending tx, rejected tx 상태를 필수로 둔다.
- claim API/tx 설계가 확정되기 전에는 active claim button을 노출하지 않는다.

### 9. Settings

```text
+--------------------------------------------------------------------------------+
| Settings                                                                       |
| Account, API, and wallet configuration                                         |
|--------------------------------------------------------------------------------|
| Account                                                                        |
| Email                              Login provider                               |
|--------------------------------------------------------------------------------|
| API Key                                                                        |
| pw_********                                      [copy]                         |
|--------------------------------------------------------------------------------|
| Smart Wallet                                                                   |
| Address 0x... [copy]       Balance $... USDC       [refresh]                   |
|--------------------------------------------------------------------------------|
| External wallet / funding                                                      |
| Connected 0x... [disconnect]       Amount [   ] [Charge]                       |
|--------------------------------------------------------------------------------|
| Purchase history                                                               |
| compact table                                                                  |
+--------------------------------------------------------------------------------+
```

Settings notes:

- MyData/pricing은 Settings에서 빼서 creator surface로 옮기는 것을 권장한다.
- Settings는 configuration만 담당한다.

### 10. Admin

```text
+--------------------------------------------------------------------------------+
| Admin Audit                                                                    |
|--------------------------------------------------------------------------------|
| [filters]                                                                      |
| [kpis]                                                                         |
| [charts]                                                                       |
| [attestation audit table]                                                      |
| [detail modal]                                                                 |
+--------------------------------------------------------------------------------+
```

Admin notes:

- 이번 redesign에서는 function-first polish만 한다.
- admin workflow를 깨지 않도록 스타일 token 적용과 overflow QA 중심으로 제한한다.

## Page-by-Page Redesign Plan

| Page/component | Direction | Specific changes |
|---|---|---|
| Landing | Claude Design landing 반영 | Claude Design section structure, dark/cyan tokens, fake metric removal, CTA 정리 |
| AppLayout | dark product shell | `/claims` route slot, grouped nav, mobile drawer, Cmd+K route update |
| Dashboard | activity overview | timeline 유지, recent artifact table 정리, claim/benchmark summary card는 status만 |
| Explorer | marketplace browser | compact toolbar, card/table density, buyer decision fields |
| AttestationCard | listing card | provenance/price/trust badges, clamp/truncate, stable footer |
| PurchaseModal | buyer flow modal | preview, price, receipt, reputation 순서 정리. claim 제거 |
| Attest | artifact creation tool | chat surface 유지, guard/quota/attest states 정돈 |
| Analytics | product usage + benchmark evidence | live/offline/proxy 분리, quality/no-match 별도 |
| Claims | creator earnings | claim API 확정 후 구현. 그 전에는 route shell만 준비 가능 |
| Settings | configuration | account/API/wallet/funding/purchase history 중심. MyData 이동 후보 |
| Admin | limited polish | style token 적용, overflow 방지, 기능 변경 최소화 |

## Claim Feature UI Integration

Claim 기능은 별도 작업으로 추가된다. UI/UX redesign에서는 배치와 상태만 먼저 확정한다.

Recommended route:

```text
/claims
```

Required data contract:

```json
{
  "creator": "0x...",
  "network": "base-sepolia",
  "chainId": 84532,
  "vaultAddress": "0x...",
  "usdcAddress": "0x...",
  "onchainClaimableAmount": "1230000",
  "onchainClaimableUsd": "1.230000",
  "dbGrossEarnedUsdMicros": 1230000,
  "dbReceiptCount": 7,
  "dbLatestVaultTxHash": "0x...",
  "dbLatestReceiptAt": "2026-06-01T00:00:00.000Z",
  "reconciled": true,
  "warnings": []
}
```

Rules:

- backend가 creator funds를 대신 claim하지 않는다.
- connected creator wallet이 직접 `claimCreatorBalance(amount, to)`를 sign한다.
- on-chain amount는 string으로 다룬다.
- DB gross earned와 on-chain claimable은 합쳐서 하나의 숫자로 표시하지 않는다.
- claim route는 API/tx가 없을 때 active payout CTA를 노출하지 않는다.

## Benchmark Result UI Integration

Analytics에 benchmark evidence section을 둔다. Landing은 benchmark metric을 hero에 넣지 않는 것이 기본이다.

Allowed hierarchy:

```text
Landing:
  no metric, or one validated metric only

Dashboard:
  benchmark status only

Analytics:
  product usage
  live provider benchmark
  offline CTT proxy
  retrieval metrics
  no-match metrics
  quality failures
  model/domain breakdown
```

Before live result:

- `Benchmarking in progress`
- `Offline proxy available` 정도의 technical label만 허용
- hero metric hidden

After live result:

- provider usage metadata면 landing/analytics 가능
- provider count API면 analytics 가능, billing claim 금지
- OpenCode request usage면 proxy label 필요
- OpenCode session total은 UI metric으로 사용하지 않음

## File Risk Map

| File | Risk | Reason |
|---|---|---|
| `web/src/index.css` | High | global design token과 모든 화면 스타일에 영향 |
| `web/src/components/AppLayout.tsx` | High | protected route navigation, mobile drawer, Cmd+K |
| `web/src/components/AttestationPurchaseModal.tsx` | High | payment, receipt, reputation, modal overflow |
| `web/src/pages/SettingsPage.tsx` | High | wallet funding, purchase history, MyData 혼재 |
| `web/src/pages/AnalyticsPage.tsx` | High | 실제 usage와 benchmark claim 혼동 위험 |
| `web/src/pages/LandingPage.tsx` | Medium | Claude Design 반영, public first impression |
| `web/src/pages/ExplorerPage.tsx` | Medium | marketplace search and filters |
| `web/src/components/AttestationCard.tsx` | Medium | card density, price/trust decision info |
| `web/src/pages/AttestPage.tsx` | Medium | chat UX, guard/quota/attest states |
| `web/src/pages/DashboardPage.tsx` | Medium | overview and timeline |
| `web/src/components/DomainTimeline.tsx` | Low-Medium | chart token/style only if possible |
| `web/src/App.tsx` | Low-Medium | `/claims` route addition |
| `web/src/lib/api.ts` | Low-Medium | typed helpers only, no API behavior change unless needed |
| `web/src/config/wagmi.ts` | Medium | claim ABI only after claim feature is confirmed |

## Implementation Order

1. User confirms this revised plan.
2. Claude Code fetches and analyzes Claude Design link.
3. Codex updates this plan if Claude Design analysis changes IA or visual direction.
4. Create design token patch in `index.css`.
5. Update `AppLayout` shell and nav grouping.
6. Apply Claude Design landing structure to `LandingPage`.
7. Redesign Explorer and AttestationCard.
8. Refactor PurchaseModal visual structure without changing payment behavior.
9. Polish Attest tool surface.
10. Split Settings responsibilities and decide where MyData goes.
11. Add Analytics benchmark evidence section with safe placeholder state.
12. Add Claims route shell only if user wants early route visibility.
13. Update Dashboard overview cards.
14. Responsive polish.
15. Browser QA.

Important dependency order:

```text
Claude Design intake
  -> design tokens
  -> landing
  -> app shell
  -> workflow pages

Claim API/tx design
  -> claims route active UI
  -> dashboard claim summary

Benchmark live/proxy result
  -> analytics benchmark evidence
  -> optional landing metric
```

## Browser QA Checklist

Required viewports:

- desktop 1440px
- laptop 1280px
- tablet 768px
- mobile 390px

Required pages/flows:

- `/landing` first viewport and CTA
- `/login` redirect behavior
- authenticated `AppLayout` nav
- mobile drawer open/close
- Cmd+K search modal
- `/dashboard`
- `/explorer` card grid and table view
- purchase modal preview, paid, free, unlocked, insufficient balance, reputation states
- `/attest` empty, loading, response, attested states
- `/analytics` with no data, product data, benchmark placeholder/result states
- `/claims` zero balance, claimable, wrong network, wallet mismatch, pending, success, error states
- `/settings` wallet disconnected, connected, smart wallet missing, charge pending states
- `/admin` table/modal overflow

Required checks:

- no blank screens
- no console errors
- no text overlap
- no button overflow
- no modal overflow
- no horizontal scroll on mobile
- charts fit container
- long hashes, tx ids, wallet addresses truncate cleanly
- disabled states are visually clear
- focus ring is visible
- `npm --prefix web run build` passes
- `npm --prefix web run lint` passes or any existing lint failures are explicitly reported

## Prompt For Codex Implementation After Approval

```text
ProofWeave UI/UX redesign을 승인된 plan 기준으로 구현해줘.

전제:
- Claude Design 링크 분석 결과를 먼저 반영한다.
- landing은 Claude Design 구조/톤을 유지한다.
- app 내부는 같은 제품처럼 보이되, landing hero처럼 과장하지 않는다.
- claim 기능은 아직 별도 작업이면 active payout CTA를 노출하지 않는다.
- benchmark 결과가 없으면 metric을 만들지 않는다.

구현 순서:
1. design tokens and base CSS
2. AppLayout
3. Landing
4. Explorer + AttestationCard
5. PurchaseModal
6. Attest
7. Settings responsibility cleanup
8. Analytics benchmark placeholder/result surface
9. Claims route shell only if approved
10. Dashboard
11. responsive polish
12. browser QA

검증:
- npm --prefix web run build
- npm --prefix web run lint
- Browser QA at 1440, 1280, 768, 390

주의:
- 근거 없는 1.24M, 100%, 90% 금지
- offline CTT를 landing hero metric으로 쓰지 말 것
- UI 안에 설명 텍스트를 과하게 넣지 말 것
- mobile overflow를 반드시 확인할 것
```

## Prompt For Claude ultracode Review

```text
ProofWeave UI/UX redesign plan을 제품 포지션, payout 정확성, benchmark claim 관점에서 리뷰해줘.

전제:
- landing은 Claude Design dark/cyan marketplace 방향을 반영한다.
- app 내부는 buyer/creator/operator가 실제로 쓰는 작업 도구다.
- claim 기능과 benchmark live result는 별도 작업 후 반영한다.
- 현재 증거 없는 숫자는 사용 금지다.

검토:
1. IA가 buyer/creator/operator에게 자연스러운가
2. Claude Design landing language가 app 내부까지 무리 없이 확장되는가
3. landing copy가 현재 근거보다 과장되지 않는가
4. benchmark 숫자 반영 방식이 안전한가
5. claims/earnings가 payout 기능과 정확히 맞는가
6. Settings와 Claims 분리가 적절한가
7. MVP에서 빼도 되는 UI와 꼭 필요한 UI는 무엇인가
```

## Done Criteria For Planning

- Claude Design 링크 intake 절차가 정의되어 있다.
- 현재 web 구조 inventory가 있다.
- route/IA가 정리되어 있다.
- page별 변경 계획이 있다.
- `/claims` 배치 제안이 있다.
- Claude Design 디자인 언어 유지 기준이 있다.
- 근거 없는 숫자와 copy 제거 기준이 있다.
- benchmark 반영 기준이 있다.
- claim 결과 반영 기준이 있다.
- 변경 파일 risk map이 있다.
- 구현 순서가 있다.
- 화면별 와이어프레임이 있다.
- browser QA 체크리스트가 있다.
- 구현은 사용자 컨펌 이후로 보류되어 있다.
