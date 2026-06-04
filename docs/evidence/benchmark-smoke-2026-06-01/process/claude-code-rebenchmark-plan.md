# ProofWeave Token-Efficiency 재측정 계획 (Claude Code 기준)

작성일: 2026-06-01
작성 환경: Claude Code (solo, subagent/병렬/full-run 없이 수행)
관련 입력: `observed-usage-report.md`, `chart-data.json`, 3개 모델 summary, `benchmark-v2.full.json`, `run-benchmark-v2.ts`, `live-model-cost-token-plan.md`

> 용어 고정: 이 문서에서 "절감"은 항상 두 가지로 구분한다.
> - **컨텍스트(input) 절감**: 모델에 넣는 입력 컨텍스트 토큰이 줄어드는 것.
> - **총 토큰/비용 절감**: 요청 전체 토큰(입력+출력+reasoning+cache 등) 또는 청구 비용이 줄어드는 것.
> 이 둘은 다르며, 현재 증거로는 전자만 일부 뒷받침된다.

> usageSource 라벨: `offline_ctt`(로컬 tiktoken proxy) / `opencode_request_usage`(OpenCode 런타임 관측) / `provider_billing`(provider usage metadata, **현재 없음**).

---

## 단계 1 — 기존 OpenCode 결과 진단

### 1.1 input reduction과 total reduction이 크게 갈린 이유

OpenCode eligible(no-match 제외 4쌍) 관측값:

| 모델 | usageSource | input 절감 | total 절감 | 비용 |
|---|---|---:|---:|---|
| Claude Opus 4.8 | `offline_ctt`(proxy) | 66.92% | 63.67% | n/a |
| GPT-5.5 Fast High | `opencode_request_usage` | 63.58% | **2.38%** | n/a |
| Gemini 3.5 Flash | `opencode_request_usage` | 10.09% | **1.21%** | PW가 **더 비쌈** ($0.1132→$0.1227) |

핵심은 **분모 구성**이다. `total = input + output + reasoning + cache_read + (런타임 오버헤드)`인데, ProofWeave가 줄이는 것은 오직 `input`의 일부(benchmark 컨텍스트)뿐이다.

- GPT: rawInput 80,461 → PW 29,534 (input은 크게 줄었으나) rawTotal 111,681 → PW 109,023. total에서 input을 뺀 잔차가 raw ~30k, PW ~79k로, **줄지 않는(오히려 늘어난) 비-input 성분이 total을 지배**한다.
- Gemini: cache_read가 raw 97,428 / PW 97,405로 거의 동일하게 total(134,939)을 지배한다. 여기에 reasoning이 raw 4,873 → PW 6,381로 **PW에서 더 늘어** total·비용이 PW에서 더 나빠졌다.

즉 input은 줄었지만, total을 구성하는 다른 성분이 (a) ProofWeave와 무관하게 크거나 (b) ProofWeave 경로에서 오히려 늘어서, total/비용 절감이 사라졌다.

### 1.2 cache read / reasoning / agent runtime / session wrapper의 왜곡 경로

- **cache read**: Gemini에서 ~97k 토큰. agent 시스템 프롬프트·도구 정의 등 고정 컨텍스트가 캐시로 잡혀 total을 채운다. benchmark 컨텍스트 차이를 압도한다.
- **reasoning/thinking token**: provider가 output/비용에 포함시키는 구간이 있고, 두 경로에서 비결정적이며 PW에서 더 많이 나오기도 했다(GPT 280→482, Gemini 4,873→6,381). 절감을 깎거나 역전시킨다.
- **agent runtime overhead**: OpenCode는 단일 요청이 아니라 멀티스텝 agent 루프(시스템 프롬프트, 도구 스키마, 재시도, 세션 wrapper)다. 같은 benchmark 쿼리라도 경로별로 루프 횟수·주입 컨텍스트가 달라져 total이 크게 흔들린다.
- **결정적 증거(절대 규모 불일치)**: GPT eligible raw input 80,461 vs 동일 4쿼리 **offline raw 3,457 → 약 23배**. PW 경로의 input delta(50,927)도 offline delta(2,337)의 약 22배다. 즉 OpenCode "input"의 ~96%가 benchmark 컨텍스트가 아니라 agent scaffolding이다. **따라서 OpenCode의 input reduction(63.58%)조차 benchmark 컨텍스트의 깨끗한 측정이 아니다** — 비율이 우연히 offline과 비슷할 뿐 절대값은 무관하게 부풀려져 있다.

### 1.3 이론이 틀린 것인가, harness가 부적합한 것인가

구분이 필요하다.

- **harness 부적합(주된 원인)**: OpenCode total/비용은 cache·reasoning·runtime이 섞여 benchmark 변수를 분리하지 못한다. total/비용 절감이 작게 나온 것은 대부분 측정 도구의 문제다.
- **이론에 대한 실제 caveat(부차적이지만 진짜)**: offline 측정에서 `top_k`(retrieval k=5로 artifact를 넣는 현실 경로)는 raw 대비 컨텍스트가 **−38%, 즉 증가**한다(아래 3.2). "정답 listing을 artifact로 압축"하면 67% 줄지만, "검색 결과 5개를 넣으면" 오히려 늘 수 있다. 따라서 "ProofWeave는 무조건 토큰을 줄인다"는 명제는 **검색 정밀도/Top-K에 의존**하며, 무조건 참이 아니다.

### 1.4 현재 사용 가능한 주장 / 금지할 주장

사용 가능(라벨 필수):
- "정답 근거가 동일할 때, ProofWeave artifact는 raw source 대비 **offline 컨텍스트 토큰 기준 약 67% 작다** (usageSource=`offline_ctt`, tiktoken_o200k_base)."
- "GPT OpenCode 관측에서도 input 토큰은 크게 줄었다(방향성 일치)." — 단, 절대 규모는 agent overhead로 오염됨을 함께 표기.

금지:
- "ProofWeave가 총 토큰/비용을 N% 절감한다" — provider billing metadata 없음, total은 harness 오염.
- "Gemini에서 비용이 절감된다" — 관측상 PW가 더 비쌌다.
- 세 모델을 한 차트에서 직접 비교 — usageSource·query set이 달라 apples-to-apples 아님.
- offline CTT를 "billing 절감"으로 표현 — proxy일 뿐이다.

---

## 단계 2 — Claude Code / direct API용 재측정 설계

### 2.1 OpenCode overhead를 피하는 최소 설계 원칙

1. **agent 루프 금지**: 단일 요청(single-shot)만. 도구 호출·멀티스텝·재시도 없음.
2. **고정 시스템 프롬프트 + 고정 출력 schema**: 경로(raw/PW) 간 차이는 오직 "넣는 컨텍스트"뿐이게 한다.
3. **cache / batch / web search / grounding / file search OFF**: total을 오염시키는 성분 제거.
4. **paired**: 같은 query에 raw와 ProofWeave를 연속 측정, 같은 seed/temperature(가능하면 temperature=0).
5. **지표 분리 기록**: 아래 2.3.
6. **출력 cap 동일**: `max_output_tokens` 모델 공통(예: 600).

### 2.2 고정 query set (canonical 5)

GPT/Gemini가 쓴 set으로 고정(no-match 1개 포함):

- `bq_full_013` (market_timeseries)
- `bq_full_019` (regulatory_comparison)
- `bq_full_025` (security_deployment)
- `bq_full_031` (agent_workflow)
- `bq_full_037` (api_spec_migration, **no-match** → 절감 집계 제외, "검색 안 함" 품질로만 평가)

paired 비교: 각 query에 대해 raw workflow와 ProofWeave workflow를 동일 조건으로.

### 2.3 측정 단위 분리 (혼합 금지)

| 지표 | 정의 | usageSource | 현재 가용성 |
|---|---|---|---|
| offline context token | fixture 컨텍스트를 tiktoken으로 센 값 | `offline_ctt` | ✅ 지금 측정 가능 (단계 3) |
| Claude Code observed usage | 세션 중 관측 가능하면 | (관측 가능 시) | ⚠️ 요청별 정확 분리 어려움 → 측정만, 주장 금지 |
| provider usage metadata | API 응답 usage 원본 | `provider_billing` | ❌ API key/하네스 있을 때만 |
| estimated cost | provider usage × 당일 단가 | proxy면 proxy 표기 | ❌ provider usage 전제 |

그리고 **input/context 절감**과 **total/request·cost 절감**을 항상 별도 컬럼으로 보고한다.

---

## 단계 3 — 수행한 최소 재측정 (Option A: 모델 호출 없음)

OpenCode/live overhead를 완전히 배제하기 위해 **Option A**(canonical 5쿼리의 offline 컨텍스트 토큰만 재계산)를 수행했다. 모델 호출·비용 0.

- 방법: 기존 canonical harness `run-benchmark-v2.ts`를 offline로 실행, `benchmark-v2-results.jsonl`에서 canonical 5쿼리만 추출.
- CTT method: **tiktoken_o200k_base** (모델 무관 동일 proxy). usageSource=`offline_ctt`.
- 시나리오: `raw`(정답 listing의 raw source) / `artifact`(정답 listing의 ProofWeave artifact) / `top_k`(retrieval k=5 결과를 artifact로).

### 3.1 per-query 결과

| queryId | domain | no-match | raw CTT | artifact CTT | top_k CTT | artifact 절감 | top_k 절감 |
|---|---|:--:|---:|---:|---:|---:|---:|
| bq_full_013 | market_timeseries | no | 879 | 289 | 1210 | 67.12% | −37.66% |
| bq_full_019 | regulatory_comparison | no | 884 | 277 | 1220 | 68.67% | −38.01% |
| bq_full_025 | security_deployment | no | 865 | 288 | 1172 | 66.71% | −35.49% |
| bq_full_031 | agent_workflow | no | 829 | 266 | 1169 | 67.91% | −41.01% |
| bq_full_037 | api_spec_migration | **yes** | 53 | 61 | 61 | n/a | n/a |

### 3.2 집계 (eligible = no-match 제외 4쿼리)

| 시나리오 | CTT 합 | raw 대비 |
|---|---:|---:|
| raw | 3,457 | — |
| artifact | 1,120 | **−67.60% (컨텍스트 절감)** |
| top_k (k=5) | 4,771 | **+38.01% (컨텍스트 증가)** |

해석(과장 없이):
- **artifact 경로(정답 근거 동일, 압축형)**: offline 컨텍스트 토큰 약 **67.6% 절감**. 4쿼리 모두 66.7~68.7%로 분산이 작다. 전체 42쿼리 값(67.41%)과도 일치.
- **top_k 경로(현실 검색, k=5)**: 컨텍스트가 **약 38% 증가**. raw 베이스라인이 "정답 1~2개"인데 top_k는 5개 후보를 넣기 때문이다. 즉 검색 파이프라인을 그대로 쓰면 입력이 늘 수 있고, 절감은 **검색 정밀도와 K 선택에 의존**한다.
- 이 수치는 모두 `offline_ctt` proxy이며 **billing이 아니다.** 출력/총 토큰/비용은 여기서 측정하지 않았다(=주장하지 않는다).

### 3.3 OpenCode와의 대조

- offline artifact 절감(67.6%)과 GPT OpenCode input 절감(63.58%)은 방향·크기대가 비슷 → ProofWeave 경로가 input을 줄였다는 방향성은 재확인.
- 그러나 1.2에서 보듯 OpenCode 절대값은 ~23배 부풀려져 있어, **인용 가능한 컨텍스트 절감 수치는 offline 67.6%뿐**이다.

### 3.4 검색 정밀도(Top-K) 의존성 — offline k-곡선 (canonical 5 eligible 4, 비용 0)

`top_k`의 컨텍스트 순효과를 k별로 offline 재계산했다 (usageSource=`offline_ctt`):

| k | raw CTT 합 | top_k CTT 합 | raw 대비 |
|---:|---:|---:|---:|
| 1 | 3,457 | 1,111 | **−67.86% (절감)** |
| 2 | 3,457 | 1,971 | −42.99% (절감) |
| 3 | 3,457 | 2,868 | −17.04% (절감) |
| 5 | 3,457 | 4,771 | **+38.01% (증가)** |

해석: 검색 파이프라인의 컨텍스트 순효과는 **k=3~5 사이에서 0을 교차**한다. 즉 ProofWeave의 컨텍스트 절감은 "artifact 압축"이 고정 이득이더라도, 실제 파이프라인에서는 **검색이 좁을 때(k가 작고 정밀할 때)만** 순절감으로 이어진다. 발표/주장 시 "Top-K와 검색 정밀도 조건"을 반드시 함께 명시해야 한다. (k=1이 artifact oracle 67.6%와 거의 같은 것은, 정답 listing이 보통 rank 1에 잡히기 때문이다 — 검색 품질은 `run-retrieval-benchmark.ts`가 별도 평가.)

(Option B[live 1쿼리]는 Claude Code 세션에서 요청별 provider usage를 깨끗이 분리 관측할 수 없어 수행하지 않았다 — 측정 못 할 수를 주장으로 만들지 않기 위함. Option C[API 하네스 설계]는 아래 단계 4-3.)

---

## 단계 4 — 산출물

### 4.1 OpenCode benchmark 실패/한계 요약
- total/비용에 cache·reasoning·agent runtime이 섞여 benchmark 변수를 분리 불가 → total 절감 1~2%, Gemini는 PW가 더 비쌈.
- input 절대값도 ~23배 오염 → input reduction조차 깨끗한 컨텍스트 측정 아님.
- Claude=offline_ctt / GPT·Gemini=opencode_request_usage로 단위 상이, query set도 상이 → 3모델 직접 비교 불가.

### 4.2 ProofWeave 이론의 현재 상태
- **살아 있는 부분**: "동일 근거를 artifact로 주면 컨텍스트(input)가 작다." offline CTT 67.6%(canonical 5의 eligible 4) / 67.41%(전체 42). 방향성은 GPT input에서도 재확인.
- **검증 실패한 부분**: "총 토큰/비용 절감." 현재 어떤 usageSource로도 입증 안 됨(OpenCode total 오염, billing metadata 없음, Gemini는 역전).
- **아직 미검증인 부분**: provider billing 기준 절감, 출력 토큰 영향, 멀티턴/실서비스 경로, top_k>정답수일 때의 순효과(현재 데이터로는 k=5에서 컨텍스트 증가). 단일 single-shot direct API 측정이 필요.

### 4.3 Claude Code / direct API 재측정 설계 (실행 전 단계)
`live-model-cost-token-plan.md`의 API 설계를 채택하되 1차는 최소로 축소:
- 스크립트 후보: `scripts/run-live-model-benchmark.ts` (single-shot, agent 루프 없음).
- 경로: `raw`, `artifact`만 우선(`top_k`는 별도 — 검색 효과와 압축 효과를 섞지 않기 위해).
- provider usage 원본 보존: OpenAI `usage`, Anthropic `usage`(cache off), Gemini `usageMetadata`.
- cache/batch/search/tool OFF, temperature=0, max_output_tokens 공통(예 600), concurrency=1.
- 출력 schema 고정(answer/used_listing_ids/missing_evidence/confidence/rubric terms).
- 기록: inputTokens/outputTokens/totalTokens/(reasoning|thinking)/estimatedCost(단가 출처 표기)/qualityScore. input절감과 total·cost절감을 별도 필드.

### 4.4 최소 smoke query set
canonical 5 (`bq_full_013,019,025,031,037`), no-match 037은 절감 집계 제외.

### 4.5 비용 cap 전략
- **하드 cap 없는 live run 금지** (OpenCode에서 로그상 $0.28 vs 계정 ~$15 괴리 경험). 
- 1차 paid run: 5쿼리 × 2경로(raw/artifact) × 3모델 = 30 호출, output cap 600, concurrency 1, cache/tool off.
- 실행 전 예상 상한 = Σ(예상 input+output 토큰 × 당일 단가)을 계산해 문서화하고, provider 대시보드에 spend limit 설정.
- 실패/재시도 row도 비용에 포함해 집계.

### 4.6 provider billing claim의 필요 조건
다음이 모두 충족될 때만 "비용/총토큰 절감"을 말한다.
1. provider usage metadata 원본(JSON) 보존, usageSource=`provider_billing`.
2. cache/reasoning/tool 등 비-benchmark 성분 OFF 또는 분리 집계.
3. 같은 query set·같은 프롬프트·같은 출력 cap으로 raw vs PW paired.
4. 당일 단가 출처(스크린샷/URL) 기록.
5. no-match·품질 실패 케이스 제외 규칙 명시.
6. input절감과 total/cost절감을 분리 보고.

### 4.7 다음 액션
1. (선택, 저비용) `top_k`를 k=1·k=2로도 offline 재계산해 "검색 정밀도 vs 컨텍스트 절감" 곡선을 만든다 — 모델 호출 0.
2. direct API 하네스(`run-live-model-benchmark.ts`) 구현 + 단가 config 작성. **실행은 비용 cap 합의 후.**
3. 1차 paid run은 raw/artifact만, 5쿼리×3모델, provider usage 보존.
4. 결과는 input절감/총토큰절감/비용절감을 분리해 보고하고 라벨 부착.

---

## 부록 — 재현 명령 (offline, 비용 0)

```bash
cd experiments/token-efficiency
npm run benchmark:v2 -- --out-dir=/tmp/pw-rebench-offline
# 산출물의 benchmark-v2-results.jsonl에서 canonical 5쿼리 추출
```

수치 출처: 위 명령의 `benchmark-v2-results.jsonl` (2026-06-01 실행), usageSource=`offline_ctt`, cttMethod=`tiktoken_o200k_base`. provider billing 아님.
