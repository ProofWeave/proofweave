# Plan 3 (Claude) — ProofWeave UI/UX 재설계

> `03-uiux-codex.md`를 대체한다. 11개 에이전트 코드 감사(전 화면 + 초기화 버그·프롬프트 기록·검색 조사)에 근거해 작성.
> **데스크톱 전용.** 모바일 레이아웃은 진행하지 않는다(기존 모바일 scaffolding은 제거 대상).
> 랜딩(`Part 1`, `web/src/styles/landing.css`)의 Slate+Cyan provenance 언어를 앱 전역으로 확장한다.

---

## 0. 설계 원칙 (Claude 버전의 관점)

코덱스 계획은 "화면별 와이어프레임 나열"에 머물렀다. 이 계획의 핵심은 두 가지다.

1. **연결성 우선(Connectivity-first).** ProofWeave는 단일 흐름을 가진 제품이다 —
   `등록(Attest) → 발견(Explorer) → 구매(Purchase) → 수익/청구(Claim) → 평판(Reputation)`.
   모든 화면·데이터는 이 흐름 위의 노드여야 하고, **어떤 데이터를 클릭하면 그 데이터와 연결된 다음 노드로 이동**해야 한다. 현재 앱은 거의 모든 요소가 클릭 불가능한 dead-end다(감사 전 화면 공통 지적).
2. **정직한 활동 추적(Honest activity, not vanity metrics).** 증명 불가능한 "토큰 절감" 카운터팩추얼을 버리고, 원장에 기록된 사실(내가 등록/구매한 데이터, 영수증, 수익, 평판)만 보여준다.

부차 원칙: 정보 과부하 금지(의미 있는 연결만), 버튼/여백 공간 효율화, UI 뭉개짐 금지, 색상은 랜딩과 통일.

---

## 1. 핵심 진단 (감사 요약)

### 1.1 전 화면 공통 (cross-cutting)
| 문제 | 근거 | 영향 |
|---|---|---|
| **테마 불일치** — 앱 전체가 warm light/maroon (`--accent-purple #8B3A4A`, `--bg-secondary #FFFFFF`, 차트 maroon hex) | `index.css:13-22`, admin charts, 전 화면 | 요구 #6 위반. 토큰 재정의가 모든 작업의 선행조건 |
| **화면 초기화 버그** — 인증 blip에 user→null → `/landing`으로 튕김 | `AuthContext.tsx:77-78`(모든 이벤트 setUser), `App.tsx:36-37,103`, `api.ts:65-67`(401→clearApiKey) | 요구 #5. 세션 중 갑자기 메인으로 이동 |
| **영속성 전무** — 검색어·타이핑한 프롬프트가 어디에도 저장 안 됨 | 프롬프트는 `AttestPage.tsx:114-115` useState뿐; localStorage 미사용 | 요구 #2 |
| **연결성 전무** — 카드/차트/KPI/행/뱃지가 전부 inert | 전 화면 `connectivityGaps` | 요구 #4 |
| **과대 버튼** — full-width `.btn`(10/20px), 모달 `width:100%` 버튼 | `index.css .btn`, PurchaseModal 다수 | 요구 #8 |
| **USDC 6자리** `$0.000000` | Settings/Analytics/Modal 전반 | 가독성 |

### 1.2 화면별 한 줄 진단
- **AppLayout**: 평면 7-nav + Cmd+K는 라우팅 단축키일 뿐(검색엔진 아님), 공유 page-title bar 없음, 죽은 모바일 코드.
- **Dashboard**: "차트 2개"뿐(글로벌 timeline + recent table). 개인 흐름·연결·드릴다운 0.
- **Explorer**: 카드/테이블에 **가격 미표시**, 페이지네이션이 잘못된 데이터셋 기준, 멀티셀렉트 필터가 client/server 반반으로 lossy, 자동검색 effect 2개가 churn 유발(초기화 버그 가중).
- **Attest**: 프롬프트 비영속, in-page 401이 하드 로그아웃 유발, "새 대화"가 확인 없이 전체 삭제, 수동탭은 죽은 UI, attest 결과가 dead-end.
- **Analytics**: 헤드라인이 **증명 불가능한 카운터팩추얼**(creator 선언 baseline), 대부분 사용자에게 빈 화면, 전부 inert.
- **Settings**: 7개 관심사를 한 라우트에 욱여넣음, **"My Data"가 내 데이터가 아니라 글로벌 마켓 전체를 보여줌**(creator 필터 없음), 지갑 연결 전 3-컬럼 그리드 뭉개짐.
- **Admin**: 정작 "batch verification"이 페이지에서 가장 작은 카드, KPI/차트가 20행 페이지 기준이라 오해 소지, 로그 12개로 silently truncate.
- **PurchaseModal**: 한 모달이 preview~결제~수신증~평판 전 생애주기를 85vh 스크롤로, settlement rail 3회 중복.

---

## 2. 디자인 토큰 시스템 (Slate + Cyan, 앱 전역)

랜딩 팔레트를 앱 전역 토큰으로 승격한다. `index.css :root`의 warm 토큰을 **이름은 유지하되 값만 교체**해 다운스트림 화면 코드 변경을 최소화한다(점진 교체).

| 토큰(기존 이름 유지) | 신규 값 | 용도 |
|---|---|---|
| `--bg-primary` | `#0B121C` | 앱 배경 |
| `--bg-secondary` | `#131D2A` | 카드/패널 |
| `--bg-tertiary` / surface-raised | `#1E293B` | 모달/입력/raised |
| `--bg-elevated` | `#18222F` | dropdown/hover |
| `--border-subtle` | `rgba(226,232,240,0.10)` | 기본 구분선 |
| `--border-hover`/strong | `rgba(226,232,240,0.20)` | hover/focus |
| `--text-primary` | `#E8F0F0` | 본문 강조 |
| `--text-secondary` | `#9FB1BC` | 본문 |
| `--text-muted` | `#6C808D` | 메타 |
| `--accent-purple`→ `--accent` | `#22D3EE` (cyan) | primary action/active |
| `--accent-purple-dim`→ `--accent-dim` | `rgba(34,211,238,0.12)` | active 배경 |
| `--accent-2` | `#74BEB4` / `#97CEC7` (teal) | 데이터/보조 |
| `--success` `--warning` `--error` | `#74BEB4` · `#F59E0B` · `#F76C6C` | verified/pending/failed |
| `--chart-1..6` | cyan/teal ramp + amber/blue 보조 | 차트 |
| `--font-mono` | `'IBM Plex Mono'` | 라벨/해시/수치 (uppercase label) |

규칙: radius ≤ 8px, 버튼/아이콘버튼 고정 width/height, hash/tx/address는 `min-width:0; overflow:hidden; text-overflow:ellipsis` + mono. teal/cyan 단색화 방지(amber/green/rose 보조 유지).

> `--accent-purple` 등 기존 이름을 그대로 둔 채 값만 cyan으로 바꾸면 수백 개 사용처를 안 건드려도 즉시 통일된다. 이름까지 정리하는 건 후속 cleanup.

---

## 3. 정보구조(IA) + 연결성 모델

### 3.1 라우트 / 사이드바 (그룹화)
```
ProofWeave  ·  AI Artifact Network
─ WORKSPACE
   Dashboard      내 활동 흐름 개요
   Attest         AI 분석 + 등록 (프롬프트 기록)
   Explorer       마켓플레이스
─ ACCOUNT
   Activity       (구 Analytics) 내 등록·구매·수익·평판
   Earnings       (구 Claims) 수익 청구
   Settings       계정·API·지갑
─ ADMIN  (role-gated)
   Verification   batch verification 시각화
```
- 공유 **page-title bar**(sticky)를 `AppLayout <main>` 안에 추가 → 화면별 중복 `.page-header` 제거, 현재 섹션·엔티티·검색 진입점을 상단에 상시 노출.
- Cmd+K는 layout 레벨에 상시 마운트(어디서나 호출 — 요구 #1 유지).

### 3.2 연결 그래프 (클릭 → 도착)
```
Dashboard stat tile ─┬─ My Attestations  → Explorer(creator=me)
                     ├─ My Purchases     → Activity(구매 탭)
                     ├─ Claimable        → Earnings
                     └─ Reputation       → Activity(평판 탭)
Timeline domain/day  → Explorer(?domain=&date=)
Recent row           → PurchaseModal / Explorer detail(?att=id)

Explorer card: creator → Explorer(creator=)      domain/model chip → 필터 추가
               price    → PurchaseModal(결제)      tx → Basescan
PurchaseModal: 영수증 → Activity(구매)             badge → Explorer 필터
Attest: attested id → Explorer detail(?att=)       모델/쿼터 → Activity(사용량)
Activity row: attestation → Explorer detail        tx → Basescan      수익 KPI → Earnings
Admin run log row → AttestationDetailModal         mismatch pill → local vs onchain hash + Basescan
전역 Cmd+K: 결과行(hash/addr) → 해당 attestation detail (generic ?q= fallback 유지)
```
모든 모달은 `?att=<id>` URL 백킹 → 딥링크/복원 가능.

---

## 4. 화면별 재설계

### 4.1 AppLayout / Nav / Cmd+K  (요구 #1, #8)
- 전체 슬레이트+사이언 재토큰, 죽은 모바일 코드(`sidebarOpen`/overlay/hamburger) 제거.
- nav를 §3.1처럼 라벨 섹션(IBM Plex Mono)으로 그룹화, 링크 padding 축소(공간 효율), Admin은 role-gate.
- 공유 sticky page-title/breadcrumb bar 추가(검색 트리거 + 현재 엔티티).
- Cmd+K를 **진짜 command palette**로 승격: 입력 debounce→`/search` 라이브 결과 + nav 라이브 필터 + ↑↓/Enter 선택 + 결과行 딥링크. `localStorage`에 **최근 검색 + 타이핑 프롬프트 기록** 저장해 "최근" 섹션 노출(요구 #2의 클라이언트 측). Escape는 `searchOpen` 가드. dialog/combobox a11y.
- sign-out는 라벨 있는 정식 컨트롤, user badge → `/settings` 링크 + 단일 라인.

### 4.2 Dashboard — 글로벌 차트 → 개인 흐름 개요  (요구 #3, #4)
- 상단: 컴팩트 **흐름 strip**(stat 타일 4개) — My Attestations / My Purchases(+총지출) / Claimable Earnings / Reputation. 소스는 이미 존재하는 `/stats/me`·`/claims/me`·`/purchases/mine`·`/wallet/balance`. 각 타일은 §3.2대로 드릴.
- 중단: domain timeline 유지하되 **legend/day 클릭 → Explorer 필터**(현재는 toggle만).
- 하단: Recent Attestations 행 → 해당 항목 컨텍스트로 이동(현재 전부 bare `/explorer`). bouncing chevron 제거, empty-state에 `Attest 등록하기` 링크.
- 정보 과부하 금지: 차트 도배 대신 "내가 참여한 흐름"만.

### 4.3 Explorer + AttestationCard  (요구 #4, #6, #8)
- 카드/테이블에 **실제 가격** 표시(`priceUsdMicros`→`$0.50`/`무료`), 테이블에 Price·problemType 컬럼 추가.
- 필터 전부 server-side(domain/type repeatable params, price flag) → 페이지네이션/totalCount/멀티셀렉트 정합. 단일 canonical result set으로 grid+pagination 구동.
- 자동검색 effect 정리(2개 중복 → 1개) → churn/초기화 가중 제거.
- creator 표시+클릭(=creator 필터), domain/model chip 클릭=필터 추가, tx→Basescan.
- 검색 submit 버튼 compact(`btn-sm`), focus ring cyan.

### 4.4 Attest  (요구 #2)
- **프롬프트 영속**: 마운트 시 `GET /prompt-history` 하이드레이트 + History 패널(프롬프트·모델·시각·attest 여부). 자세한 full-stack은 §5.2.
- in-page 401을 하드 로그아웃으로 취급하지 않음 → API key 재발급+재시도, Attest에 머무름(초기화 버그 근본 차단의 일부, §5.1).
- "새 대화"는 활성 대화 view만 비우고 기록은 보존, 확인 추가.
- 수동탭: 기능 전까지 명확한 disabled/secondary(현재는 바인딩 없는 죽은 textarea).
- attested 메시지 id → Explorer detail/receipt 링크. 토큰/비용 noise 뱃지 축소(요구 #7 방향과 정합).

### 4.5 Analytics → **Activity** (내 활동)  (요구 #7)
증명 불가능한 절감 카운터팩추얼 **전면 삭제**(`avoidedInputTokens`, `averageReuseEfficiency` 등). 원장 기반 사실만:
1. **내가 등록한 데이터** — 내 attestations + 각 평판 요약.
2. **내가 구매한 데이터** — `GET /purchases/history`(vault 영수증 + tx).
3. **내 수익** — `GET /claims/me`(grossEarned, claimable, reconciled, paymentCount, latestVaultTxHash).
4. **평판 given/received** — ⚠️ 현재 **읽기 API 없음** → `artifact_reputation_logs` 기반 신규 엔드포인트 필요(§5.3 후속).
- 모든 행 드릴(attestation→detail, tx→Basescan, 수익 KPI→Earnings). USDC 정상 포맷. 차트는 "사실이 있을 때만", 빈 차트 도배 금지.

### 4.6 Settings + MyData  (요구 #10)
- **분리**: Settings = 계정/API key/Smart Wallet/외부지갑·충전(금융·신원). MyData(creator 데이터+가격)는 Activity의 "내가 등록한 데이터" 또는 별도 creator surface로 이동.
- **뭉개짐 해결**: 지갑 연결 전 `1fr 1fr 1fr` 고정 그리드(거의 빈 카드 3개) → content-aware 단일/2-up 레이아웃.
- **버그**: "My Data"가 `/search?limit=100`(creator 필터 없음)으로 글로벌 마켓을 보여줌 → 내 creator로 필터.
- 충전 error 상태 UI 분기 추가, 6-자리 USDC 포맷, ad-hoc 버튼 padding 통일.

### 4.7 Admin → **Verification** (batch 시각화)  (요구 #9)
페이지를 뒤집어 **batch verification이 곧 화면**이 되게 한다(WDK 미사용 — 기존 클라이언트 루프 위 프론트엔드 시각화).
- 상단 primary "Verification Run" 패널: 큐 셀렉터(검색/필터가 큐를 채움) + 컴팩트 **Run** + **Cancel**(AbortController) 버튼.
- 라이브 run view: 항목이 resolve될 때마다 스트리밍 — 현재 항목 하이라이트, 행별 `local contentHash vs onchainHash`, status pill(verified/mismatch/error/not-found), elapsed. 로그 truncate(12) 제거(전체 + 가상 스크롤/페이지).
- 오해 소지 KPI 제거: 20행 페이지 기준 "Last 24h/Verified Ratio/Verification Runs"와 20행 기준 차트 삭제(또는 totalCount 기반으로 정정).
- run log 행 → 기존 `AttestationDetailModal`, mismatch pill → hash 비교 + Basescan. 전역 Cmd+K 쿼리 → admin 큐 시드.
- 동시성 cap + cancel(현재 20행 순차 round-trip, 중단 불가). 차트 슬레이트+사이언 재토큰.

### 4.8 PurchaseModal  (요구 #8)
- 한 모달을 **2-phase 점진 공개**로: Phase1 preview + 컴팩트 price confirm(4단계 settlement rail → 인라인 status chip 1개, 3회 중복 제거). Phase2 구매한 **데이터가 첫째·지배 요소**(success 헤더+MD/JSON 토글 바로 아래), settlement/receipt는 강등.
- 중첩 스크롤 해소(외부 85vh + 내부 400px). 모든 `width:100%` 버튼 → 컴팩트. creator/badge 클릭 연결, `?att=` URL 백킹.

---

## 5. 3대 기능 변경 (상세)

### 5.1 화면 초기화 버그 (요구 #5) — 근본 원인 확정
- **주원인(high)**: `AuthContext.onAuthStateChange`가 **모든 이벤트**에 `setUser`를 호출(`AuthContext.tsx:77-78`) → SIGNED_IN 재방출(탭 refocus/refresh)마다 새 user 참조 → Protected/PublicOnlyRoute 재평가. 세션이 일시적으로 null이면 `App.tsx:36-37`에서 `/landing`으로.
- **가중**: catch-all `path="*" → /`(`App.tsx:103`) → RootRedirect 재판정. in-page 401이 `api.clearApiKey()`(`api.ts:65-67`).
- **수정**:
  1. `AuthContext`: `SIGNED_OUT`에서만 user=null; 그 외 이벤트는 **id 동일하면 이전 user 참조 유지**(불필요 재렌더 방지).
  2. in-page 401을 하드 로그아웃으로 취급하지 않음 — 키 재발급+재시도(§4.4).
  3. `path="*"`는 `/landing`/`/dashboard` 직접 분기 또는 NotFound로(루트 재판정 루프 제거).
- 파일: `web/src/contexts/AuthContext.tsx`(+ `App.tsx`, `web/src/lib/api.ts`).

### 5.2 프롬프트 기록 (요구 #2) — UI → DB → 백엔드
기존 `llm_usage_events` 패턴을 그대로 복제(owner 키, INSERT on analyze, SELECT by owner).
- **DB** (`api/src/db/migrate.ts` SCHEMA 문자열이 단일 소스):
  `prompt_history(id uuid pk, owner text, prompt text, model text, result text, input_tokens, output_tokens, estimated_cost_usd_micros, llm_usage_event_id→llm_usage_events, attestation_id→attestations, created_at)` + `idx_prompt_history_owner_created_at(owner, created_at desc)`. owner는 lowercase(`web:email` 포함).
- **API**: 신규 `api/src/routes/promptHistory.ts`(stats.ts 형태) → `index.ts` 마운트. `GET /prompt-history`(owner-scoped, LIMIT 50). `POST /ai/analyze` 성공 직후(`ai.ts:~203`) `recordPromptHistory()` INSERT(analytics.ts 패턴). 선택: `DELETE /prompt-history/:id`, attest 시 `attestation_id` UPDATE.
- **UI**: AttestPage 마운트 시 하이드레이트 + History 패널(클릭 시 재입력/재실행). "새 대화"는 기록 보존. 추가로 Cmd+K "최근"에 localStorage 미러(오프라인/즉시성).

### 5.3 Analytics → Activity (요구 #7)
- §4.5. 신규 필요: 평판 given/received 읽기 API(`artifact_reputation_logs` 기반) — `GET /reputation/me`(given) + attestation별 received는 기존 `/attestations/:id/reputation` 재사용.

---

## 6. 버튼 / 여백 / 뭉개짐 원칙 (요구 #8, #10)
- 기본 버튼: `btn-sm` 스케일(≈6px/12px)을 기준 밀도로. primary CTA만 약간 큼. **`width:100%` 금지**(폼 전체폭 입력 옆 submit 제외).
- 아이콘 버튼: 고정 정사각 hit-area + hover/focus 가시화.
- 모달/카드: 고정·예측가능 width, 중첩 스크롤 금지, "데이터 전달" 외 불필요한 세로 스크롤 최소화.
- 뭉개짐: 빈 카드를 고정 그리드에 욱여넣지 않음 → content-aware. 6-자리 USDC → `$0.50` 포맷 유틸 공용화.

---

## 7. 구현 페이즈 (automode, 페이즈당 ≤5파일, 각 페이즈 build+lint 검증)

| # | 페이즈 | 주요 파일 | 요구 |
|---|---|---|---|
| A | **디자인 토큰** slate+cyan 전역 | `index.css :root`(+소수 override) | #6 |
| B | **초기화 버그** | `AuthContext.tsx`, `App.tsx`, `api.ts` | #5 |
| C | **AppLayout/Nav/page-bar + Cmd+K 팔레트** | `AppLayout.tsx`(+css) | #1,#8 |
| D | **Dashboard 흐름화 + 드릴** | `DashboardPage.tsx`, `DomainTimeline.tsx` | #3,#4 |
| E | **Analytics→Activity** | `AnalyticsPage.tsx`(→`ActivityPage`), 라우트 | #7,#4 |
| F | **Explorer+Card** 가격·드릴·서버필터 | `ExplorerPage.tsx`, `AttestationCard.tsx` | #4,#8 |
| G | **Settings 분리 + MyData 버그·뭉개짐** | `SettingsPage.tsx`, `MyDataSection.tsx` | #10 |
| H | **Admin→Verification 시각화** | `AdminDashboard.tsx`, admin/* | #9 |
| I | **프롬프트 기록** UI→DB→API | `migrate.ts`, `routes/promptHistory.ts`, `ai.ts`, `AttestPage.tsx` | #2 |
| J | **PurchaseModal** 2-phase | `AttestationPurchaseModal.tsx`(+css) | #8 |

의존: A가 모든 시각 작업 선행. B는 독립(가장 먼저 가능). I는 DB→API→UI 순. E/G는 활동/크리에이터 데이터 공유.

검증(페이즈마다): `npm --prefix web run build`, `npm --prefix web run lint`; API 변경 시 `npm --prefix api test`(EPERM 루프백 테스트 제외 알려진 이슈 명시).

---

## 8. 정직성 가드레일 (유지)
금지: `1.24M+`, `100% verifiable`, `90% cost saving`, 증명 없는 `avoidedTokens/cost`, `averageReuseEfficiency` 배수, `live/real/verified` 강주장.
허용: 원장 기록 사실(등록/구매/영수증/수익/평판 카운트, on-chain tx), provider usage metadata(sample size·date·model 명시). offline CTT는 technical detail로만, hero metric 금지.

---

## 9. 완료 기준
- 전 화면 slate+cyan 통일, warm 토큰 잔존 0.
- 세션 중 임의 `/landing` 튕김 재현 불가.
- 타이핑 프롬프트가 refresh/remount 후에도 남음(서버 백킹).
- Dashboard가 개인 흐름 + 드릴다운 제공, 차트 도배 아님.
- Activity가 증명 가능한 활동만, 모든 행 연결.
- Explorer 카드에 가격, 페이지네이션 정합, 필터 server-side.
- Settings 뭉개짐 없음, MyData가 실제 내 데이터.
- Admin이 batch verification 라이브 시각화.
- 과대/`width:100%` 버튼 제거, 6-자리 USDC 제거.
- build/lint 통과(데스크톱 전용, 모바일 미진행).
