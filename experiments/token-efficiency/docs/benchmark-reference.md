# ProofWeave 벤치마크 참조 문서

이 문서는 ProofWeave의 토큰 절감 효과와 모델별 재현성을 검증하기 위한 기준 문서다.
기존 `token-efficiency-verification-report.md`나 `token-efficiency-experiment-setup.md`를 대체하지 않고,
새 벤치마크를 실행할 때 기준으로 삼는 독립 문서로 사용한다.

## 1. 목표

ProofWeave의 주장은 한 문장으로 줄이면 다음이다.

```text
사용자가 raw source 전체를 LLM context에 넣는 대신,
이미 검증/정제된 ProofWeave artifact를 검색해 사용하면
입력 context와 비용을 줄일 수 있다.
```

이 주장은 다음 네 층을 분리해서 검증해야 한다.

| 층 | 검증 질문 | 토큰 절감 지표인가 |
|---|---|---|
| Token | 같은 질문에서 raw path보다 ProofWeave path가 input token을 줄이는가 | 예 |
| Cost | 줄어든 token이 data price를 포함해 실제 비용 절감으로 이어지는가 | 예 |
| Quality | 줄어든 context로도 답변/작업 품질이 유지되는가 | 간접 |
| Retrieval | 필요한 artifact를 검색으로 잘 찾는가 | 아니오, 별도 지표 |

주석: Retrieval은 토큰 절감과 섞어 계산하지 않는다. 검색이 틀리면 토큰은 줄어도 제품 성공이 아니다.

## 2. 비교 모델

동일한 benchmark set을 아래 3개 model label로 반복 실행한다.

| Provider | Benchmark model label | Reasoning/Mode label | 주의 |
|---|---|---|---|
| Anthropic | `claude-opus-4.8` | default | live 실행 전 실제 API model id와 token counting endpoint 지원 여부 확인 |
| OpenAI | `gpt-5.5-fast-high` | `high` | OpenCode에서 GPT-5.5 Fast + high 선택값 확인, live 실행 전 pricing 확인 |
| Google | `gemini-3.5-flash` | flash | live 실행 전 실제 API model id와 `countTokens` 지원 여부 확인 |

주석: 이 문서에서 위 이름은 benchmark label이다. 실제 provider API에 넘길 model id는 실행 시점에 별도 매핑해야 한다.

## 3. 실험 경로

각 query는 반드시 같은 질문으로 `raw_workflow`와 `proofweave_workflow`를 모두 실행한다.

### 3.1 Raw Workflow

```text
user query
→ raw source bundle 전체 또는 전체 candidate catalog를 context에 주입
→ model별 답변 생성 또는 token count
→ token / cost / latency / quality 기록
```

주석: Raw Workflow는 사용자가 직접 원문 문서, CSV, 로그, spec, 공지, 체크리스트를 모아서 LLM에게 넣는 경로다.

### 3.2 ProofWeave Workflow

```text
user query
→ ProofWeave 검색 top-k
→ preview card 또는 selected artifact 결정
→ artifact만 context에 주입
→ model별 답변 생성 또는 token count
→ token / cost / latency / quality 기록
```

주석: ProofWeave Workflow는 "검색으로 후보를 좁힌 뒤 필요한 artifact만 읽는 경로"다.

## 4. 핵심 수식

### 4.1 Context Token Reduction

```text
T_raw_i,m = input_tokens(raw_prompt_i, model_m)
T_pw_i,m  = input_tokens(proofweave_prompt_i, model_m)

TokenReduction_i,m = 1 - T_pw_i,m / T_raw_i,m
```

주석:
- `i`는 query id다.
- `m`은 model label이다.
- `T_raw`와 `T_pw`는 같은 모델에서 측정해야 한다.
- 모델 간 tokenizer가 다르므로 `claude` token과 `gpt` token을 직접 더하지 않는다.

### 4.2 Canonical Token Reduction

Provider API 없이 반복 실행 가능한 기본 지표는 `Canonical Text Tokens`다.

```text
CTT = len(tiktoken.get_encoding("o200k_base").encode(canonical_text))
CTT_Reduction_i = 1 - CTT_pw_i / CTT_raw_i
```

주석:
- CTT는 billing token이 아니다.
- CTT는 모델 독립적인 paired comparison 기준이다.
- 실제 비용 주장은 provider usage metadata가 있어야 한다.

### 4.3 Net Cost Saving

```text
RawCost_i,m = input_raw_i,m * input_rate_m
            + output_raw_i,m * output_rate_m

ProofWeaveCost_i,m = input_pw_i,m * input_rate_m
                   + output_pw_i,m * output_rate_m
                   + data_price_i

NetSave_i,m = RawCost_i,m - ProofWeaveCost_i,m
```

주석: 데이터 가격을 빼지 않은 token-only saving은 실제 구매 경제성을 설명하지 못한다.

### 4.4 Quality-Adjusted Saving

```text
QAS_i,m = NetSave_i,m * QualityPass_i,m
```

`QualityPass`는 V1에서 0 또는 1로 시작한다.

| 값 | 의미 |
|---:|---|
| 1 | rubric pass, hallucination 없음, 필수 항목 포함 |
| 0 | fail, hallucination, 필수 항목 누락, wrong artifact |

주석: 품질 실패를 0점 처리해야 "틀린 답을 싸게 만든 것"이 절감으로 계산되지 않는다.

## 5. Retrieval 지표는 별도 산출

Retrieval은 토큰 절감 결과 파일과 분리해서 낸다.

| 지표 | 정의 |
|---|---|
| `hit_at_1` | 정답 listing이 top-1인가 |
| `hit_at_3` | 정답 listing이 top-3 안에 있는가 |
| `hit_at_5` | 정답 listing이 top-5 안에 있는가 |
| `mrr` | 첫 정답 순위의 역수 평균 |
| `ndcg_at_5` | graded relevance를 반영한 top-5 품질 |
| `no_match_precision` | 정답 없음 query에서 구매 후보를 내지 않는 비율 |
| `wrong_buy_rate` | top-1이 오답인데 선택될 위험 |

주석: NO_MATCH query에서 context가 작아지는 것은 성공이 아니다. `no_match_expected=true`인 query는 검색이 "없음"을 맞혔는지로 평가한다.

## 6. 데이터셋 최소 기준

초기 benchmark v2의 최소 기준은 다음이다.

```text
domains: 6개
queries: 최소 60개
listings: 최소 60개
decoys: domain별 최소 3개
no-match queries: 전체 query의 10~20%
models: 3개
paths per query: raw_workflow + proofweave_workflow
```

권장 기준은 다음이다.

```text
domains: 6개
queries: 120개 이상
listings: 200개 이상
decoys: domain별 10개 이상
no-match queries: 전체 query의 15%
bootstrap resamples: 2,000회 이상
```

## 7. 6개 도메인

| domain id | 설명 | ProofWeave에 적합한 이유 |
|---|---|---|
| `api_spec_migration` | 최신 API/spec migration | 모델 학습 데이터가 쉽게 outdated 된다 |
| `onchain_fee_measurement` | 온체인/가스/수수료 실측 데이터 | raw RPC/log 수집 비용이 크다 |
| `market_timeseries` | 거래/시장 시계열 데이터 | CSV/시계열 정제 가치가 크다 |
| `regulatory_comparison` | 법령/규제 비교표 | 최신성/근거/관할권 구분이 중요하다 |
| `security_deployment` | 보안 배포 체크리스트 | 실패 비용이 커서 품질 rubric이 중요하다 |
| `agent_workflow` | Agent skill/prompt/workflow recipe | 재사용 artifact 자체가 상품 가치다 |

## 8. Fixture Schema

### 8.1 Query Fixture

```json
{
  "queryId": "q_api_001",
  "domain": "api_spec_migration",
  "userQuery": "Responses API로 이전할 때 tool call 응답 형식과 max token 옵션 변경점을 알려줘.",
  "expectedListingIds": ["att_api_responses_001"],
  "acceptableListingIds": ["att_api_responses_002"],
  "noMatchExpected": false,
  "expectedListingKinds": ["skill", "workflow_recipe"],
  "qualityRubric": {
    "mustInclude": ["Responses API", "tool call", "max_output_tokens"],
    "mustNotHallucinate": ["nonexistent endpoint", "gpt-6"],
    "passThreshold": 0.8
  }
}
```

### 8.2 Listing Fixture

```json
{
  "attestationId": "att_api_responses_001",
  "kind": "workflow_recipe",
  "title": "Responses API Migration Workflow",
  "domain": "api_spec_migration",
  "problemType": "migration",
  "keywords": ["responses api", "tool call", "max_output_tokens", "migration"],
  "sourceBundle": ["source-bundles/api/responses-migration.md"],
  "artifactPath": "artifacts/api/responses-migration-recipe.md",
  "createdAt": "2026-05-01T00:00:00Z",
  "priceUsdMicros": 250000,
  "freshnessWindowDays": 30
}
```

### 8.3 Model Config Fixture

```json
{
  "models": [
    {
      "modelLabel": "claude-opus-4.8",
      "provider": "anthropic",
      "providerModelId": "VERIFY_AT_RUN_TIME",
      "reasoningMode": "default",
      "inputUsdPer1MTokens": 0,
      "outputUsdPer1MTokens": 0,
      "countMode": "offline_canonical"
    },
    {
      "modelLabel": "gpt-5.5-fast-high",
      "provider": "openai",
      "providerModelId": "VERIFY_AT_RUN_TIME",
      "reasoningMode": "high",
      "inputUsdPer1MTokens": 0,
      "outputUsdPer1MTokens": 0,
      "countMode": "offline_canonical"
    },
    {
      "modelLabel": "gemini-3.5-flash",
      "provider": "google",
      "providerModelId": "VERIFY_AT_RUN_TIME",
      "reasoningMode": "flash",
      "inputUsdPer1MTokens": 0,
      "outputUsdPer1MTokens": 0,
      "countMode": "offline_canonical"
    }
  ]
}
```

주석: offline mode에서는 세 모델 모두 같은 CTT를 입력받지만, 결과 row는 model별로 3번 생성한다. live mode에서는 provider별 token counter와 usage metadata로 교체한다.

## 9. Prompt Template

### 9.1 Raw Prompt

```text
You are evaluating whether the provided raw sources answer the user query.

User query:
{{userQuery}}

Raw sources:
{{rawSourceBundle}}

Return:
1. direct answer
2. evidence references
3. missing information
4. risk of outdated or hallucinated claims
```

### 9.2 ProofWeave Prompt

```text
You are evaluating whether the selected ProofWeave artifact answers the user query.

User query:
{{userQuery}}

Selected artifact:
{{artifact}}

Return:
1. direct answer
2. evidence references from the artifact
3. missing information
4. whether the artifact should be purchased/reused
```

주석: 두 prompt는 질문과 출력 요구를 최대한 같게 유지해야 paired comparison이 된다.

## 10. 모델별 실행 매트릭스

각 query마다 6개 row가 생긴다.

| query | model | workflow |
|---|---|---|
| `q_001` | `claude-opus-4.8` | raw |
| `q_001` | `claude-opus-4.8` | proofweave |
| `q_001` | `gpt-5.5-fast-high` | raw |
| `q_001` | `gpt-5.5-fast-high` | proofweave |
| `q_001` | `gemini-3.5-flash` | raw |
| `q_001` | `gemini-3.5-flash` | proofweave |

주석: query 수가 60개면 최소 360개 workflow row가 생성된다.

## 11. 결과 파일

권장 output 구조:

```text
<out-dir>/
  benchmark-v2-results.jsonl
  benchmark-v2-summary.json
  benchmark-v2-model-summary.csv
  benchmark-v2-domain-summary.csv
  benchmark-v2-summary.md
  retrieval-results.jsonl
  retrieval-summary.json
  retrieval-domain-summary.csv
  retrieval-summary.md
```

`benchmark-v2-results.jsonl` row 예시:

```json
{
  "queryId": "q_api_001",
  "modelLabel": "gpt-5.5-fast-high",
  "domain": "api_spec_migration",
  "matched": true,
  "raw": { "ctt": 12400, "cb": 51200 },
  "proofweave": { "ctt": 2100, "cb": 8900, "topK": 3 },
  "cttReduction": 0.8306,
  "dataPriceUsdMicros": 250000,
  "qualityProxyPass": true,
  "retrievalJudgment": "exact"
}
```

## 12. Pass/Fail 기준

benchmark run은 다음 조건을 모두 만족해야 "사용 가능한 결과"로 본다.

| 조건 | 기준 |
|---|---|
| Pilot fixture size | `benchmark-v2.full.json` 기준 query 42개 이상 |
| Publication fixture size | query 60개 이상 |
| Domain coverage | 6개 domain 모두 포함 |
| No-match coverage | query의 10% 이상 |
| Retrieval reporting | Hit@1, Hit@3, MRR, no-match precision 포함 |
| Token reporting | model별 median/mean/p10/p90 포함 |
| Quality reporting | rubric pass rate 포함 |
| Reproducibility | fixture snapshot 저장 |

주석: `benchmark-v2.sample.json` 결과는 코드 검증용이다. `benchmark-v2.full.json`은 내부 발표용 pilot fixture로 사용할 수 있지만, 외부 주장용으로는 60개 이상 query와 live provider usage가 필요하다.

## 12.1 현재 채운 fixture

현재 기본 fixture는 `experiments/token-efficiency/fixtures/benchmark-v2.full.json`이다.

| 항목 | 값 |
|---|---:|
| domains | 6 |
| listings | 18 |
| matched queries | 36 |
| no-match queries | 6 |
| total queries | 42 |
| default top-k | 5 |

주석: full fixture는 raw source note와 compressed artifact를 모두 포함하므로 offline run이 seed sample보다 훨씬 냉정한 구조를 가진다. 단, 여전히 provider API를 부르지 않으므로 실제 billing token/cost 결과는 아니다.

## 13. 1차 출처 후보

다음 출처는 데이터셋을 만들 때 우선 확인할 1차 또는 공식 문서 후보다. 실제 fixture 작성 시점에 최신 여부를 다시 확인한다.

| 영역 | 출처 후보 |
|---|---|
| OpenAI API migration | https://platform.openai.com/docs/guides/migrate-to-responses |
| OpenAI token/usage | https://platform.openai.com/docs/api-reference/usage |
| Anthropic token counting | https://docs.anthropic.com/en/docs/build-with-claude/token-counting |
| Gemini token counting | https://ai.google.dev/api/tokens |
| Solana priority fee | https://solana.com/docs/rpc/http/getrecentprioritizationfees |
| OpenZeppelin upgrades | https://docs.openzeppelin.com/upgrades-plugins |
| Upbit market data | https://global-docs.upbit.com/docs/how-to-download-candle-data |
| CoinGecko historical market data | https://docs.coingecko.com/v3.0.1/docs/2-get-historical-data |
| Polymarket market API | https://docs.polymarket.us/retail-api/market/overview |
| Pendle API | https://api-v2.pendle.finance/core/docs |
| FATF VA/VASP guidance | https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html |

## 14. 해석 규칙

- "CTT 기준 X% 감소"와 "실제 청구 비용 X% 감소"를 섞어 쓰지 않는다.
- NO_MATCH query는 token reduction 성공으로 세지 않는다.
- 검색 성능과 토큰 절감은 분리 보고한다.
- 모델별 결과는 같은 query set에서 나온 paired result만 비교한다.
- data price 포함 후 `NetSave`가 음수면 토큰은 줄었어도 경제성은 실패다.
- 품질 실패는 절감 0으로 처리한다.
