# ProofWeave Token Efficiency Verification Report

## 1. 결론

이번 재검증 결과, 이전에 산출한 **92.08% 절감 수치**는 “raw docs 전체를 읽는 경우 vs 이미 압축된 skill/recipe artifact를 쓰는 경우”를 비교한 **로컬 프록시 실험값**이다. 따라서 실제 서비스 지표로 그대로 주장하기에는 부족하다.

이번에는 사용자가 제공한 **공급자용 고가치 attestation 10개**와 **소비자용 실전 쿼리 10개**를 기준으로 더 직접적인 검증을 했다. 측정한 것은 “전체 후보 catalog를 LLM context에 넣는 방식”과 “ProofWeave 검색 결과 top-1 attestation card만 context에 넣는 방식”의 context token 감소량이다.

검증 결과는 다음과 같다.

| 기준 | Baseline tokens | ProofWeave tokens | Saved tokens | Reduction |
|---|---:|---:|---:|---:|
| 전체 10개 질문 | 2,784 | 527 | 2,257 | 81.07% |
| 매칭된 8개 질문만 | 2,229 | 440 | 1,789 | 80.26% |

따라서 현재 확실하게 말할 수 있는 보수적 결론은 다음이다.

> 제공된 질문 세트 기준으로, ProofWeave가 전체 후보 catalog 대신 관련 attestation card 1개만 LLM에 전달하면 **약 80%의 context token을 줄일 수 있다.**

단, 이 수치는 실제 LLM billing/tokenizer/latency/정답 품질을 측정한 값이 아니라, 로컬 `ceil(chars / 4)` 방식의 token proxy다.

---

## 2. 실험 데이터셋 구성

사용자가 제공한 데이터는 두 묶음이다.

### 2.1 공급자용 attestation 후보 10개

1. GPT-5 Responses API 마이그레이션 가이드
2. Solana Priority Fee 동적 산정 알고리즘
3. Pectra 이후 EIP-7702 위임 계정 가스 측정값
4. Binance Perp 펀딩비 × 김프 상관관계 분석
5. FATF Travel Rule 국가별 비교표
6. Base 메인넷 UUPS 프록시 배포 체크리스트
7. Claude Code Skills 작성 베스트 프랙티스
8. Pendle V3 PT/YT 수익률 만기별 매트릭스
9. Upbit/Bithumb 입출금 중단 공지 패턴 분석
10. Polymarket × Kalshi 동일 이벤트 매칭

### 2.2 소비자용 질문 10개

소비자 질문은 최신 API 변경, Travel Rule, Solana priority fee, Uniswap V4 hooks, Sui Move migration, MCP OAuth/DPoP, 김프 시계열, Pendle 분석, UUPS 배포 체크리스트, Polymarket 이벤트 데이터로 구성되어 있다.

이 중 8개는 공급자 catalog와 직접 또는 강하게 매칭되었고, 2개는 직접 대응 attestation이 없었다.

| Query type | Match |
|---|---|
| OpenAI API migration | GPT-5 Responses API guide |
| Travel Rule KYC | FATF Travel Rule comparison |
| Solana priority fee | Solana priority fee algorithm |
| Uniswap V4 hooks gas | No direct match |
| Sui Move migration | No direct match |
| MCP OAuth/DPoP | GPT-5/MCP migration guide에 부분 매칭 |
| Upbit/Binance kimchi premium CSV | Upbit/Bithumb notice pattern analysis |
| Pendle funding/strategy | Pendle matrix |
| Base UUPS proxy checklist | Base UUPS checklist |
| Polymarket events | Polymarket × Kalshi matching |

---

## 3. 무엇을 줄였는가?

ProofWeave가 줄이는 것은 단순히 “문자 수”가 아니라 LLM이 매 요청마다 반복해서 읽어야 하는 **후보 탐색 context**다.

### 3.1 Baseline 경로

일반 LLM 검색/질문 방식에서는 사용자가 다음 중 하나를 해야 한다.

1. 전체 후보 catalog를 LLM에게 넣고 관련 자료를 고르게 한다.
2. 웹에서 직접 검색하고 여러 source를 붙여 넣는다.
3. raw CSV, 공지, 문서, spec, 감사보고서 등을 직접 수집한 뒤 LLM에게 분석시킨다.

이번 재검증에서는 가장 보수적인 baseline인 1번을 사용했다.

```text
사용자 질문 + 공급자 후보 catalog 10개 전체 + 구매 판단 요청
```

### 3.2 ProofWeave 경로

ProofWeave 경로에서는 검색/매칭 시스템이 먼저 관련 attestation을 고른다. LLM에는 전체 후보 catalog가 아니라 top-1 attestation card만 들어간다.

```text
사용자 질문 + ProofWeave 검색 결과 top-1 attestation card + 구매 판단 요청
```

즉 감소하는 데이터는 다음이다.

```text
전체 후보 catalog - 관련 attestation card 1개
```

수식으로 쓰면 다음과 같다.

```text
T_baseline(i) = tokens(query_i + catalog_all + instruction)
T_pw(i)       = tokens(query_i + retrieved_attestation_i + instruction)
Saved(i)      = T_baseline(i) - T_pw(i)
Reduction(i)  = Saved(i) / T_baseline(i)
```

---

## 4. 측정 결과

토큰 측정은 local proxy인 `ceil(chars / 4)`를 사용했다. 정확한 provider tokenizer가 아니므로 실제 과금 토큰과 다를 수 있다.

| # | Query | Match | Baseline | ProofWeave | Saved | Reduction |
|---:|---|---|---:|---:|---:|---:|
| 1 | OpenAI API migration | S1 | 278 | 58 | 220 | 79.14% |
| 2 | Travel Rule KYC | S5 | 280 | 55 | 225 | 80.36% |
| 3 | Solana priority fee | S2 | 281 | 58 | 223 | 79.36% |
| 4 | Uniswap V4 hooks gas | NO_MATCH | 278 | 44 | 234 | 84.17% |
| 5 | Sui Move migration | NO_MATCH | 277 | 43 | 234 | 84.48% |
| 6 | MCP OAuth/DPoP | S1 partial | 278 | 58 | 220 | 79.14% |
| 7 | Upbit/Binance kimchi premium | S9 | 279 | 54 | 225 | 80.65% |
| 8 | Pendle funding insight | S8 | 279 | 52 | 227 | 81.36% |
| 9 | Base UUPS checklist | S6 | 277 | 52 | 225 | 81.23% |
| 10 | Polymarket events | S10 | 277 | 53 | 224 | 80.87% |

NO_MATCH 2개는 실제 제품 가치 검증에서는 성공으로 세면 안 된다. 그래서 보고 가능한 핵심 수치는 “매칭된 8개 질문 기준 80.26% 감소”다.

---

## 5. 수학적으로 검증 가능한 구조

ProofWeave의 토큰 효율성은 다음 네 층으로 나눠 검증해야 한다.

### 5.1 Context Reduction

검색 전 전체 후보군 대비 검색 후 top-k artifact만 넣었을 때 context가 얼마나 줄었는지 측정한다.

```text
CR_i = 1 - tokens(query_i + retrieved_top_k_i) / tokens(query_i + candidate_pool_i)
```

이번 실험은 이 층을 측정했다.

### 5.2 Raw Collection Avoidance

사용자가 raw source를 직접 수집해서 LLM에 넣는 대신, 이미 정제된 artifact를 구매했을 때 줄어드는 token을 측정한다.

```text
RA_i = 1 - tokens(query_i + purchased_artifact_i) / tokens(query_i + raw_sources_i)
```

이 값은 실제 raw CSV, 공지 원문, spec, 감사보고서, 온체인 로그가 있어야 측정 가능하다. 이번 실험에는 raw 원본이 없으므로 측정하지 않았다.

### 5.3 Cost Savings

토큰 감소가 실제 비용 감소로 이어지는지 계산한다.

```text
Cost_base_i = input_tokens_base_i * input_rate_m + output_tokens_base_i * output_rate_m
Cost_pw_i   = input_tokens_pw_i   * input_rate_m + output_tokens_pw_i   * output_rate_m + data_price_i
NetSave_i   = Cost_base_i - Cost_pw_i
```

여기서 중요한 점은 `data_price_i`를 반드시 빼야 한다는 것이다. 데이터 가격이 너무 높으면 token은 줄어도 순비용은 증가할 수 있다.

### 5.4 Quality-Adjusted Savings

잘못된 artifact가 재시도, 디버깅, 재구매를 유발하면 절감 효과가 사라진다. 따라서 품질 통과 여부를 곱해야 한다.

```text
QAS_i = NetSave_i * quality_pass_i
```

`quality_pass_i`는 0 또는 1로 시작하고, 나중에는 0~1 점수로 바꿀 수 있다.

### 5.5 Paired Evaluation + Confidence Interval

실제 제품 지표로 쓰려면 각 질문을 독립 샘플로 보지 말고, 같은 질문에 대해 baseline과 ProofWeave 경로를 동시에 측정하는 **paired design**으로 잡아야 한다.

```text
R_i = 1 - T_pw_i / T_base_i
MeanReduction = mean(R_i)
MedianReduction = median(R_i)
```

표본 수가 적거나 질문별 분산이 큰 경우 평균만 쓰면 위험하다. 따라서 다음 중 하나를 같이 보고해야 한다.

```text
Bootstrap CI:
1. N개 질문에서 replacement sampling으로 N개를 다시 뽑는다.
2. 각 bootstrap sample의 MeanReduction 또는 MedianReduction을 계산한다.
3. 2.5 percentile과 97.5 percentile을 95% confidence interval로 보고한다.
```

권장 공개 지표는 다음 형태다.

```text
median context reduction = X%
95% bootstrap CI = [L%, U%]
match rate = matched_queries / total_queries
quality-pass-adjusted reduction = reduction * quality_pass
```

이번 10문항 검증은 표본이 작고, tokenizer가 provider 공식 tokenizer가 아니며, raw 원천 데이터가 없기 때문에 confidence interval을 사업 지표처럼 해석하면 안 된다. 다만 **계산 구조가 paired design으로 확장 가능하다**는 점은 확인됐다.

---

## 6. 현재 코드에서 연결 가능한 지점

현재 ProofWeave 코드에는 실측 기반 analytics를 만들 기반이 이미 있다.

| 목적 | 코드/테이블 |
|---|---|
| 직접 LLM 사용 기록 | `llm_usage_events` |
| attestation과 baseline LLM 사용량 연결 | `attestation_token_baselines` |
| 구매/재사용 이벤트 기록 | `data_reuse_events` |
| 사용 이벤트 생성 | `recordLlmUsage()` |
| `/attest`에 baseline 연결 | `usageEventId` |
| 재사용 기록 | `recordDataReuseOnce()` |
| 사용자별 analytics 조회 | `GET /stats/analytics/me` |
| CLI에서 baseline 연결 가능 | `proofweave publish ... --usage-event-id` |

즉 제품 구조상으로는 다음 흐름이 가능하다.

```text
Claude Code hook observes task
→ direct LLM baseline usage recorded as llm_usage_events
→ useful output is published with usageEventId
→ purchase/reuse records data_reuse_events
→ /stats/analytics/me computes avoided tokens/cost
```

하지만 아직 이번 실험에서는 이 end-to-end 실측 DB 플로우를 실제 데이터로 채우지 않았다.

---

## 7. 확실하게 말할 수 있는 것 / 아직 말하면 안 되는 것

### 말할 수 있는 것

- 제공된 질문 세트 기준, catalog 전체를 넣는 방식 대비 top-1 attestation card만 넣는 방식은 약 **80.26% context token 감소**를 보였다.
- 이 수치는 marketplace 검색/매칭이 잘 되었을 때 LLM context를 크게 줄일 수 있다는 근거다.
- ProofWeave는 `usageEventId`, `llm_usage_events`, `data_reuse_events`, `/stats/analytics/me`를 통해 실측 analytics로 확장 가능한 구조를 이미 갖고 있다.

### 아직 말하면 안 되는 것

- “실제 청구 비용이 80% 줄었다”
- “모든 모델에서 80~90% 절감된다”
- “정확도/품질이 유지된다”
- “실제 사용자의 production workflow에서 검증됐다”
- “NO_MATCH 질문도 성공적으로 해결했다”

---

## 8. 다음 실험 설계

실제 주장 가능한 수치를 만들려면 다음 순서가 필요하다.

1. 사용자가 준 10개 소비자 질문을 고정 benchmark set으로 둔다.
2. 각 질문마다 matched attestation, no-match 여부, top-k 후보를 저장한다.
3. Claude Code hook에서 실제 baseline prompt/context token을 기록한다.
4. `usageEventId`로 `/attest`와 baseline을 연결한다.
5. 구매/재사용 시 `data_reuse_events`에 avoided token/cost를 기록한다.
6. 결과 품질을 pass/fail로 라벨링한다.
7. 모델별, 질문별, artifact kind별로 confidence interval을 계산한다.

최종 보고 지표는 최소한 다음을 포함해야 한다.

```text
median context reduction
mean context reduction
p10 / p90 reduction
match rate
no-match rate
net cost saved after data price
quality-pass-adjusted savings
model-specific savings
```

---

## 9. 최종 판정

이전 92% 수치는 “가능성 시연”으로는 의미가 있지만, 실제 사업/프로덕션 지표로 쓰기에는 과감하다. 이번 질문 세트를 이용한 재검증에서는 더 보수적인 **80.26% context token 감소**가 나왔다.

따라서 현재 가장 안전한 표현은 다음이다.

> ProofWeave는 고가치 attestation catalog에서 관련 자료를 top-1로 좁히는 것만으로도, 제공된 소비자 질문 세트 기준 약 80%의 LLM context token을 줄일 수 있었다. 다만 이 수치는 로컬 token proxy 기반이며, 실제 과금 절감과 품질 유지 여부는 Claude Code hook 기반 실측 이벤트로 추가 검증해야 한다.
