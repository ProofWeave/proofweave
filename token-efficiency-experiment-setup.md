# ProofWeave Token Efficiency Experiment Setup

## 1. 목적

이 문서는 ProofWeave의 토큰 효율화 실험을 실제로 들어가기 전에 고정해야 할 실험 환경, 측정 기준, 데이터셋 구조, 실행 방식, 보고 지표를 정의한다.

핵심 목표는 두 가지다.

1. Claude/GPT/Gemini의 실제 청구 token 방식이 서로 달라도 비교 가능한 **일률화된 token metric**을 만든다.
2. 단순 파생 요약 데이터가 아니라, raw evidence에 기반한 **prompt / skill / recipe / workflow artifact**가 실제로 LLM context와 비용을 줄이는지 검증한다.

---

## 2. Token Metric 결정

### 2.1 결론

실험의 기본 지표는 다음 두 개를 같이 사용한다.

| Metric | 이름 | 용도 |
|---|---|---|
| Primary | **Canonical Text Tokens (CTT)** | 텍스트 비교용 주 지표 |
| Secondary | **Canonical Bytes (CB)** | tokenizer 편향을 막기 위한 보조 지표 |

### 2.2 Canonical Text Tokens (CTT)

CTT는 특정 provider의 billing token이 아니라, 실험 전체에서 고정된 tokenizer를 적용한 기준값이다.

권장값:

```text
CTT = len(tiktoken.get_encoding("o200k_base").encode(canonical_text))
```

이유:

- OpenAI `tiktoken`은 공개 BPE tokenizer이고, `o200k_base`는 최신 GPT-4o 계열에서 쓰이는 공개 encoding이다.
- Claude/Gemini billing token과 같지는 않지만, 모든 실험군에 같은 tokenizer를 적용하면 상대 비교는 가능하다.
- `chars/4`보다 한국어, 코드, JSON, 마크다운 혼합 입력에서 훨씬 안정적이다.

주의:

- CTT는 **billing token이 아니다**.
- Claude/Gemini에서 실제 청구된 token과 다를 수 있다.
- 따라서 CTT는 제품/논문식 비교 지표이고, 실제 비용 계산에는 provider usage metadata를 별도 기록해야 한다.

### 2.3 Canonical Bytes (CB)

CB는 tokenizer가 특정 언어/모델에 편향되는 문제를 줄이기 위한 보조 지표다.

```text
CB = UTF-8 byte length of canonical_text
```

장점:

- 완전히 모델 독립적이다.
- 한국어, 코드, JSON, CSV 모두 동일 규칙으로 측정된다.

단점:

- 실제 LLM context window와 직접 대응하지 않는다.
- “token”보다는 “전송/문맥 크기”에 가까운 metric이다.

### 2.4 Provider Actual Tokens

실제 실험에서는 provider별 실제 사용량도 별도 컬럼으로 기록한다.

| Provider | 공식/준공식 측정 방식 | 용도 |
|---|---|---|
| OpenAI | `tiktoken`, model encoding, API usage | GPT 계열 실제 비용 보정 |
| Anthropic Claude | `/v1/messages/count_tokens`, response usage | Claude 입력 추정/실사용 검증 |
| Google Gemini | `models.countTokens`, `usage_metadata` | Gemini 입력/출력/생각 token 검증 |

보고서에서는 다음처럼 구분한다.

```text
Canonical result: CTT 기준 X% 감소
Provider result: Claude 실제 usage 기준 Y% 감소
Cost result: data price 포함 후 $Z 절감
```

---

## 3. 데이터 가치 방법론

### 3.1 피드백 반영

이전 피드백의 핵심은 다음이다.

> 로우한 데이터가 아니면 가치가 너무 없다. 보통 대화에서 진짜 문서를 읽고 파생질문을 하지, 파생된 데이터를 단순히 쓰지는 않는다. 파생 데이터는 hallucination이 섞일 수 있다. 그래서 가치 있는 데이터는 “무엇을 만들 수 있는 prompt”, “무엇을 할 수 있는 skill”처럼 데이터마켓의 니치 영역을 타겟해야 한다.

이 피드백은 맞다. 따라서 ProofWeave는 “요약 데이터 판매”가 아니라 다음 구조로 가야 한다.

```text
Raw Evidence Pack + Executable/Reusable Artifact
```

즉, 최종 상품은 prompt/skill/recipe일 수 있지만, 그 뒤에는 검증 가능한 raw evidence가 붙어야 한다.

### 3.2 Listing Kind Taxonomy

실험에서는 listing을 다음 5종으로 나눈다.

| Kind | 설명 | 가치 기준 |
|---|---|---|
| `raw_evidence_pack` | 원문 문서, CSV, 로그, 온체인 측정값 | 신뢰성, 최신성, 재현성 |
| `curated_dataset` | 정제된 표/CSV/매트릭스 | 수집/정제 비용, freshness |
| `prompt_template` | 특정 작업을 잘 수행하는 prompt | 재사용성, 결과 품질 |
| `skill` | Claude Code/Agent Skill 형태 실행 지침 | 반복 작업 자동화, progressive disclosure |
| `workflow_recipe` | 여러 단계의 분석/구현 절차 | 시행착오 절감, actionability |

중요한 규칙:

```text
summary-only artifact는 V1 고가치 상품으로 보지 않는다.
prompt/skill/recipe는 반드시 source/evidence 링크 또는 raw bundle을 참조해야 한다.
```

### 3.3 가치 점수

각 listing은 다음 점수를 가진다.

```text
ValueScore = freshness + non_substitutability + collection_cost + actionability + verifiability - hallucination_risk
```

세부 기준:

| 항목 | 의미 |
|---|---|
| `freshness` | 최근성. 24h/7d/30d/90d 등 |
| `non_substitutability` | LLM이 학습 데이터만으로 대체하기 어려운 정도 |
| `collection_cost` | 사람이 수집/정제하는 데 드는 시간 |
| `actionability` | 바로 코드/트레이딩/법무/보안 판단에 쓰이는 정도 |
| `verifiability` | raw source로 검증 가능한 정도 |
| `hallucination_risk` | 파생 artifact가 틀릴 때 피해가 큰 정도 |

---

## 4. 실험 데이터셋 세팅

### 4.1 최소 실험 단위

초기 실험은 최소 다음 규모로 잡는다.

```text
queries: 50개 이상
listings: 50개 이상
domains: 5개 이상
models: 3개 이상
runs per query: 2 paths(raw vs ProofWeave)
```

권장 도메인:

1. 최신 API/spec migration
2. 온체인/가스/수수료 실측 데이터
3. 거래/시장 시계열 데이터
4. 법령/규제 비교표
5. 보안 배포 체크리스트
6. Agent skill/prompt/workflow recipe

### 4.2 Query Fixture

각 query는 다음 JSON shape을 가진다.

```json
{
  "queryId": "q_001",
  "domain": "api_migration",
  "userQuery": "OpenAI DevDay 이후 API 변경사항 마이그레이션 가이드 있으면 살게",
  "expectedListingKinds": ["raw_evidence_pack", "skill", "workflow_recipe"],
  "qualityRubric": {
    "mustInclude": ["changed endpoint", "deprecated params", "working code"],
    "mustNotHallucinate": ["nonexistent parameter", "outdated endpoint"],
    "passThreshold": 0.8
  }
}
```

### 4.3 Listing Fixture

각 listing은 다음 JSON shape을 가진다.

```json
{
  "attestationId": "att_001",
  "kind": "skill",
  "title": "GPT-5 Responses API Migration Skill",
  "sourceBundle": ["docs/openai-responses-2026-05-10.md", "examples/mcp-realtime.ts"],
  "artifactPath": "skills/gpt5-responses-migration/SKILL.md",
  "createdAt": "2026-05-10T00:00:00Z",
  "priceUsdMicros": 250000,
  "freshnessWindowDays": 14
}
```

---

## 5. 실행 경로

각 query는 반드시 paired test로 실행한다.

### 5.1 Raw Workflow

```text
user query
→ raw source bundle 전체 또는 검색 결과 전체를 context에 주입
→ LLM 답변 생성
→ token/cost/latency/quality 기록
```

### 5.2 ProofWeave Workflow

```text
user query
→ ProofWeave search top-k
→ preview
→ buy/install selected artifact
→ artifact만 context에 주입
→ LLM 답변 생성
→ token/cost/latency/quality 기록
```

### 5.3 Harness 연결

현재 코드 기준 연결점은 다음이다.

| 단계 | 현재 코드 |
|---|---|
| 직접 LLM usage 기록 | `api/src/routes/ai.ts`, `recordLlmUsage()` |
| usage baseline 저장 | `llm_usage_events` |
| attestation과 usage 연결 | `/attest`의 `usageEventId`, `linkUsageToAttestation()` |
| artifact publish | `cli/src/index.ts`, `proofweave publish ... --usage-event-id` |
| 재사용 이벤트 기록 | `GET /attestations/:id/detail`, `recordDataReuseOnce()` |
| analytics 조회 | `GET /stats/analytics/me` |

---

## 6. 측정 지표

### 6.1 Canonical Token Reduction

```text
CTT_Reduction_i = 1 - CTT_proofweave_i / CTT_raw_i
CB_Reduction_i  = 1 - CB_proofweave_i / CB_raw_i
```

### 6.2 Provider Token Reduction

```text
Provider_Reduction_i,m = 1 - provider_tokens_proofweave_i,m / provider_tokens_raw_i,m
```

### 6.3 Net Cost Saving

```text
RawCost_i,m = input_raw_i,m * input_rate_m + output_raw_i,m * output_rate_m
ProofWeaveCost_i,m = input_pw_i,m * input_rate_m + output_pw_i,m * output_rate_m + data_price_i
NetSave_i,m = RawCost_i,m - ProofWeaveCost_i,m
```

### 6.4 Quality-Adjusted Saving

```text
QAS_i,m = NetSave_i,m * QualityPass_i
```

`QualityPass_i`는 우선 0/1로 시작한다.

```text
1 = rubric pass
0 = fail / hallucination / incomplete answer / no-match
```

---

## 7. 통계 검증

### 7.1 Paired Design

모든 질문은 같은 query에 대해 raw workflow와 ProofWeave workflow를 둘 다 실행한다.

```text
R_i = 1 - T_pw_i / T_raw_i
```

### 7.2 Bootstrap Confidence Interval

보고 지표는 평균만 쓰지 않는다.

```text
1. N개 query에서 replacement sampling으로 N개 query를 다시 뽑는다.
2. 각 sample에서 median(R_i), mean(R_i)를 계산한다.
3. 2.5 percentile, 97.5 percentile을 95% CI로 보고한다.
```

최종 공개 형태:

```text
median CTT reduction: 74.2% [95% CI: 68.1%, 79.9%]
match rate: 82%
quality pass rate: 76%
quality-adjusted net saving: $X/query
```

---

## 8. 실험 디렉터리 제안

향후 구현 시 다음 구조를 만든다.

```text
experiments/token-efficiency/
  README.md
  fixtures/
    queries.jsonl
    listings.jsonl
    source-bundles/
    artifacts/
  scripts/
    count-canonical.ts
    run-paired-benchmark.ts
    score-quality.ts
    summarize-results.ts
  outputs/
    runs/<timestamp>/raw-results.jsonl
    runs/<timestamp>/proofweave-results.jsonl
    runs/<timestamp>/summary.md
```

### 8.1 `count-canonical.ts`

역할:

```text
input text → canonical JSON normalization → CTT(o200k_base) + CB 계산
```

### 8.2 `run-paired-benchmark.ts`

역할:

```text
query fixture 로드
raw workflow 실행
ProofWeave workflow 실행
provider usage metadata 저장
```

### 8.3 `score-quality.ts`

역할:

```text
rubric 기반 pass/fail
hallucination / outdated info / missing required fields 체크
```

### 8.4 `summarize-results.ts`

역할:

```text
median/mean/p10/p90/bootstrap CI/match rate/no-match rate/net cost 계산
```

---

## 9. 실험 실행 순서

### Phase 0 — Fixture 준비

```text
50~100개 query 작성
50~100개 listing 작성
각 listing에 raw source bundle 연결
quality rubric 작성
```

### Phase 1 — Offline Counting

```text
실제 LLM 호출 없이 CTT/CB만 계산
catalog 전체 vs top-k card vs installed artifact 비교
```

### Phase 2 — Provider Count API

```text
OpenAI/Claude/Gemini count API로 input token 측정
아직 답변 생성은 하지 않음
```

### Phase 3 — Live Paired Run

```text
같은 query를 raw workflow와 ProofWeave workflow로 실제 실행
provider usage metadata, latency, retry, quality 기록
```

### Phase 4 — Price Sensitivity

```text
data_price를 $0, $0.001, $0.005, $0.01, $0.05로 바꿔 NetSave 민감도 분석
```

### Phase 5 — Marketplace Decision

```text
listing kind별로 실제 수익성 판단
raw_evidence_pack vs skill vs prompt_template vs workflow_recipe 비교
```

---

## 10. 이 실험에서 꼭 피해야 할 주장

아래 표현은 Phase 3 이후에만 가능하다.

```text
실제 청구 비용이 X% 줄었다
모든 모델에서 X% 절감된다
정확도 유지가 검증됐다
사용자가 실제 production에서 비용을 줄였다
```

Phase 1~2에서 가능한 표현은 다음 정도다.

```text
Canonical token 기준 context size가 X% 감소했다
Provider count API 기준 input token이 X% 감소했다
품질과 실제 청구 비용은 live paired run에서 검증해야 한다
```

---

## 11. 최종 권장안

ProofWeave의 token-efficiency 실험은 단일 숫자를 목표로 하면 안 된다. 다음 네 지표를 함께 내야 한다.

```text
1. CTT context reduction
2. provider actual token reduction
3. data price 포함 net cost saving
4. quality-adjusted saving
```

그리고 데이터 상품 전략은 다음으로 고정한다.

```text
Sell raw-backed executable artifacts, not summary-only derivative data.
```

즉, 좋은 listing은 단순 요약이 아니라 다음 구조를 가져야 한다.

```text
raw evidence pack + prompt/skill/recipe + validation rubric + update timestamp
```

이 구조여야 토큰 절감과 데이터 가치가 동시에 검증된다.

---

## 12. 참고한 공식/기술 자료

- OpenAI Cookbook — How to count tokens with tiktoken: `https://developers.openai.com/cookbook/examples/how_to_count_tokens_with_tiktoken`
- OpenAI tiktoken GitHub: `https://github.com/openai/tiktoken`
- Anthropic Claude token counting: `https://platform.claude.com/docs/en/build-with-claude/token-counting`
- Google Gemini countTokens API: `https://ai.google.dev/api/tokens`
- Google Gemini token guide: `https://ai.google.dev/gemini-api/docs/tokens`
- Hugging Face tokenization algorithms: `https://huggingface.co/docs/transformers/main/tokenizer_summary`
- Claude Code Skills: `https://docs.anthropic.com/en/docs/claude-code/skills`
- Claude Skill authoring best practices: `https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices`
