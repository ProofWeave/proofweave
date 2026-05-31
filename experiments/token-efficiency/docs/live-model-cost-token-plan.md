# Live LLM Cost and Token Measurement Plan

이 문서는 `benchmark-v2.full.json`을 실제 모델 3개에 돌릴 때 비용과 토큰을 어떻게 기록할지 정리한 실행 설계다.
핵심 결론은 단순하다. 발표/벤치마크에 쓸 수 있는 비용 수치는 구독형 웹 UI가 아니라 API 응답의 usage metadata에서 받아야 한다.

## 1. 현재 고정 모델 라벨

문서와 fixture에서 비교 라벨은 아래 3개로 고정한다.

| benchmark label | provider | live run 상태 |
|---|---|---|
| `claude-opus-4.8` | Anthropic | provider model id 확인 필요 |
| `gpt-5.5-fast-high` | OpenAI | OpenCode에서 GPT-5.5 Fast + high 선택값 기록 필요 |
| `gemini-3.5-flash` | Google | provider model id 확인 필요 |

주석: 이 라벨은 사용자가 비교하고 싶은 발표용 모델명이다. 실제 API 호출 전에는 각 provider의 현재 모델 목록에서 정확한 `providerModelId`를 매핑해야 한다. 2026-05-29 기준으로 공식 문서에서 확인 가능한 최신 이름과 가격표는 계속 바뀔 수 있으므로, live run 당일 다시 확인한다.

추가 확인 메모:

- OpenAI run은 OpenCode에서 GPT-5.5 Fast를 직접 선택하고 mode/variant를 high로 맞춘다. 결과에는 benchmark label과 실제 selected model id/mode를 분리해서 기록한다.
- Google Gemini pricing 문서는 `gemini-3.5-flash`를 노출하며, Standard paid tier의 입력은 $1.50/1M tokens, 출력은 thinking token 포함 $9.00/1M tokens로 표시했다. Priority tier는 별도 단가가 있다.
- Anthropic 모델명과 가격은 live run 직전에 pricing page와 model list를 다시 확인한다.

## 2. API로 처리하는 방식

API 방식이 정석이다. 이유는 다음과 같다.

- 입력 토큰, 출력 토큰, 총 토큰을 요청별로 남길 수 있다.
- reasoning/thinking token이 output 비용에 포함되는 경우를 provider usage로 확인할 수 있다.
- 같은 prompt, 같은 fixture, 같은 output schema를 강제할 수 있다.
- 실패/timeout/rate limit도 row 단위로 기록할 수 있다.
- 비용 계산식을 재현할 수 있다.

### 2.1 OpenAI

공식 API reference의 Responses API는 response 객체에 usage 정보를 포함한다. 별도 입력 토큰 카운트가 필요하면 Responses input token endpoint 계열을 사용한다.

기록할 필드:

```json
{
  "provider": "openai",
  "providerModelId": "확인된 실제 모델 id",
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0,
    "reasoning_tokens": 0
  }
}
```

비용 계산:

```text
openai_cost_usd =
  input_tokens / 1_000_000 * input_price_per_mtok
+ output_tokens / 1_000_000 * output_price_per_mtok
```

주의: OpenAI pricing 문서는 reasoning token이 API에 항상 세부 노출되지 않아도 context window와 billing에 영향을 줄 수 있다고 설명한다. 따라서 live result에는 provider가 준 `usage` 원본을 그대로 저장한다.

공식 참조:

- https://platform.openai.com/docs/api-reference/responses/create
- https://platform.openai.com/docs/pricing
- https://platform.openai.com/docs/advanced-usage

### 2.2 Anthropic

Anthropic은 Messages API 응답 usage에 `input_tokens`, `output_tokens`를 제공하고, 별도 count token endpoint로 메시지 입력 토큰을 사전 계산할 수 있다.

기록할 필드:

```json
{
  "provider": "anthropic",
  "providerModelId": "확인된 실제 모델 id",
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

비용 계산:

```text
anthropic_cost_usd =
  base_input_tokens / 1_000_000 * input_price_per_mtok
+ cache_write_tokens / 1_000_000 * cache_write_price_per_mtok
+ cache_read_tokens / 1_000_000 * cache_read_price_per_mtok
+ output_tokens / 1_000_000 * output_price_per_mtok
```

주의: prompt caching을 켜면 input token 단가가 일반 입력, cache write, cache hit로 갈라진다. 이번 벤치마크 1차 live run은 cache를 끄는 것이 결과 해석이 쉽다.

공식 참조:

- https://platform.claude.com/docs/en/api/messages
- https://platform.claude.com/docs/en/api/messages/count_tokens
- https://docs.anthropic.com/en/docs/about-claude/pricing

### 2.3 Gemini

Gemini API는 `models.countTokens`로 입력 토큰을 사전 계산할 수 있고, `generateContent` 응답의 `usageMetadata`에서 prompt/candidate/total token count를 확인한다.

기록할 필드:

```json
{
  "provider": "google",
  "providerModelId": "확인된 실제 모델 id",
  "usageMetadata": {
    "promptTokenCount": 0,
    "candidatesTokenCount": 0,
    "totalTokenCount": 0,
    "thoughtsTokenCount": 0
  }
}
```

비용 계산:

```text
gemini_cost_usd =
  promptTokenCount / 1_000_000 * input_price_per_mtok
+ candidatesTokenCount / 1_000_000 * output_price_per_mtok
```

주의: Gemini pricing은 output price에 thinking tokens가 포함되는 모델 구간이 있다. live runner는 `usageMetadata` 원본을 보존하고, pricing config에는 thinking 포함 여부를 별도 메모로 남긴다.

공식 참조:

- https://ai.google.dev/api/tokens
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/pricing

## 3. 구독형 웹 UI로 처리할 수 있나?

권장하지 않는다.

가능한 것은 대략적인 품질 비교뿐이다. ChatGPT/Claude/Gemini 웹 구독 UI는 보통 다음이 부족하다.

- request별 input token
- request별 output token
- reasoning/thinking token
- 캐시 적용 여부
- 정확한 API billing 단가
- raw JSON usage metadata
- 같은 시스템 프롬프트와 출력 JSON schema 강제

Browser/Chrome으로 웹 UI를 자동화할 수는 있지만, 그 결과는 "모델 답변 샘플"이지 "비용/토큰 벤치마크"가 아니다. 발표에서 비용 절감률을 말하려면 API 모드가 필요하다.

## 4. Live Runner 설계

추가할 스크립트 후보:

```text
scripts/run-live-model-benchmark.ts
```

입력:

```bash
npm run benchmark:live -- \
  --fixture=fixtures/benchmark-v2.full.json \
  --provider-config=.env.local \
  --pricing=fixtures/provider-pricing.current.json \
  --models=claude-opus-4.8,gpt-5.5-fast-high,gemini-3.5-flash \
  --scenario=raw,artifact,top_k \
  --top-k=5 \
  --max-output-tokens=800 \
  --concurrency=1 \
  --out-dir=/tmp/proofweave-live-benchmark
```

출력:

```text
live-results.jsonl
live-summary.json
live-model-summary.csv
live-domain-summary.csv
live-quality-summary.csv
live-summary.md
```

`live-results.jsonl` row:

```json
{
  "benchmarkVersion": "v2-live",
  "modelId": "gpt-5.5-fast-high",
  "provider": "openai",
  "providerModelId": "resolved-live-model-id",
  "scenarioId": "artifact",
  "queryId": "bq_full_001",
  "domain": "api_spec_migration",
  "inputTokens": 0,
  "outputTokens": 0,
  "totalTokens": 0,
  "estimatedCostUsd": 0,
  "latencyMs": 0,
  "qualityScore": 0.0,
  "qualityPass": false,
  "answerJsonValid": true,
  "providerUsageRaw": {}
}
```

## 5. Live Prompt Contract

모든 모델에 같은 JSON output schema를 강제한다.

```json
{
  "answer": "string",
  "used_listing_ids": ["string"],
  "missing_evidence": ["string"],
  "confidence": "low|medium|high",
  "rubric_terms_covered": ["string"],
  "rubric_terms_missing": ["string"]
}
```

품질 점수:

```text
quality_score =
  0.70 * must_include_coverage
+ 0.20 * answer_json_valid
+ 0.10 * no_forbidden_terms
```

토큰 효율 점수:

```text
quality_adjusted_saving =
  reduction_vs_raw * quality_score
```

주석: token saving과 retrieval score는 별도 결과 파일로 유지한다. 검색이 틀린 상태에서 토큰만 줄어드는 케이스를 좋은 결과로 보지 않기 위해서다.

## 6. 실행 전 체크리스트

1. `fixtures/benchmark-v2.full.json`을 기본 fixture로 사용한다.
2. provider별 실제 API model id를 확인해서 mapping config에 쓴다.
3. pricing page에서 input/output/cache 단가를 당일 기준으로 다시 확인한다.
4. `max_output_tokens`를 모델별 동일 목표치로 맞춘다.
5. cache, batch, web search, grounding, file search는 1차 live run에서 끈다.
6. raw/artifact/top_k를 같은 query 순서로 돌린다.
7. 실패 row도 버리지 않고 `errorType`, `retryCount`, `providerStatus`로 남긴다.
8. 비용은 provider usage metadata 기준으로 계산한다.

## 7. 최소 비용 전략

1차 paid run은 아래처럼 시작한다.

- query: 42개 전체 대신 domain별 2개씩 12개 smoke
- scenario: `raw`, `artifact`만 먼저
- models: 3개 전체
- output cap: 500~800 tokens
- concurrency: 1
- cache/search/tool off

그 다음 retrieval/top-k와 전체 42개 query를 돌린다.

주석: API 없이 구독 UI로 먼저 해보고 싶다면 품질 샘플링만 하고, 비용/토큰 차트에는 포함하지 않는다.
