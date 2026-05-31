# ProofWeave 검색 매칭 알고리즘 기준

이 문서는 ProofWeave의 "LLM이 필요한 데이터셋을 검색으로 잘 찾는가"를 평가하기 위한 별도 기준이다.
토큰 절감 benchmark와 결과를 섞지 않는다.

## 1. 현재 프로젝트에 있는 검색 구현

현재 API 검색 진입점은 `GET /search`다.

```text
api/src/routes/attestations.ts
→ searchAttestations()
→ api/src/services/attestation.ts
```

현재 `searchAttestations()`의 텍스트 검색은 다음 필드를 대상으로 한다.

```text
ai_model ILIKE query
metadata.title ILIKE query
metadata.abstract ILIKE query
keywords exact contains query
keywords joined text ILIKE query
```

필터는 다음을 지원한다.

```text
creator
aiModel
domain
problemType
limit
offset
```

결과 정렬은 현재 의미 기반 score가 아니라 `created_at DESC`다.

```text
ORDER BY created_at DESC
```

## 2. 현재 구현의 판정

현재 프로젝트에는 "검색 필터"는 있지만, benchmark용 "매칭 기반 ranking algorithm"은 충분히 구현되어 있지 않다.

| 항목 | 현재 상태 | 판정 |
|---|---|---|
| keyword/title/abstract 검색 | 있음 | 기본 검색 가능 |
| domain/problemType filter | 있음 | 필터 가능 |
| rank score | 없음 | benchmark에는 부족 |
| exact/partial/wrong judgment | 없음 | 별도 구현 필요 |
| Hit@K/MRR/nDCG 계산 | 없음 | 별도 구현 필요 |
| no-match threshold | 없음 | wrong-buy 방지 평가 불가 |
| retrieval 결과 snapshot | 없음 | 재현성 부족 |

주석: 현재 API는 사용자가 검색해 목록을 보는 데는 동작할 수 있지만, "검색 품질을 수치로 검증"하기에는 score와 judgment가 없다.

## 3. 매칭 알고리즘 요구사항

벤치마크용 매칭 알고리즘은 실제 서비스 검색과 독립적으로 먼저 만들 수 있다.

필수 입력:

```text
query fixture
listing fixture
retrieval config
```

필수 출력:

```text
queryId
topK listing ids
score breakdown
expected rank
hit@1 / hit@3 / hit@5
mrr
ndcg@5
no-match verdict
```

## 4. V1 Offline Matching Algorithm

V1은 외부 embedding이나 LLM judge 없이 deterministic lexical scorer로 시작한다.

### 4.1 Canonical Token Set

각 query와 listing에서 비교용 token set을 만든다.

```text
query_terms = normalize(userQuery + expectedListingKinds + domain)
listing_terms = normalize(title + domain + problemType + keywords + abstract + kind)
```

정규화 규칙:

```text
1. lowercase
2. trim
3. punctuation 제거
4. snake_case, kebab-case를 공백으로 분리
5. 1글자 token 제거
6. stopword 제거
7. 중복 제거
```

주석: 한국어 형태소 분석은 V1에서 하지 않는다. 한국어 query라도 기술 키워드, API명, chain명, domain id가 들어가도록 fixture를 설계한다.

### 4.2 Score Components

```text
score =
  4.0 * exact_title_match
+ 3.0 * expected_kind_match
+ 3.0 * domain_match
+ 2.0 * problem_type_match
+ 2.0 * keyword_overlap_ratio
+ 1.5 * abstract_overlap_ratio
+ 1.0 * freshness_score
- 4.0 * stale_penalty
- 5.0 * contradiction_penalty
```

주석: 점수는 처음부터 완벽할 필요가 없다. 중요한 것은 deterministic하고 score breakdown을 남기는 것이다.

### 4.3 Freshness Score

```text
age_days = now - listing.createdAt
freshness_score = max(0, 1 - age_days / freshnessWindowDays)
```

단, 최신 API/spec migration처럼 freshness가 중요한 domain은 가중치를 높인다.

```text
api_spec_migration: freshness_weight = 2.0
market_timeseries: freshness_weight = 2.0
regulatory_comparison: freshness_weight = 1.5
```

### 4.4 No-match Threshold

검색 결과가 있어도 score가 낮으면 "no match"로 처리한다.

```text
if top1_score < minScore:
  predicted = NO_MATCH
```

권장 초기값:

```text
minScore = 4.5
minScoreByDomain.api_spec_migration = 5.0
minScoreByDomain.regulatory_comparison = 5.0
```

주석: no-match threshold는 wrong-buy를 막기 위한 장치다. 낮게 잡으면 아무거나 추천하고, 높게 잡으면 recall이 떨어진다.

## 5. Graded Relevance

각 query는 listing별 relevance를 가질 수 있다.

| relevance | 의미 |
|---:|---|
| 3 | exact answer |
| 2 | acceptable partial answer |
| 1 | same domain but insufficient |
| 0 | irrelevant |
| -1 | dangerous/wrong/outdated |

`nDCG@5`는 이 graded relevance를 이용한다.

```text
DCG@K = sum((2^rel_i - 1) / log2(i + 1))
nDCG@K = DCG@K / ideal_DCG@K
```

주석: exact hit만 보면 partial answer 품질을 잃는다. nDCG는 "정답에 가까운 후보가 위에 있는지"를 보기 위한 보조 지표다.

## 6. Retrieval Benchmark와 Token Benchmark 분리

결과 파일을 분리한다.

```text
retrieval-results.jsonl
benchmark-v2-results.jsonl
```

`retrieval-results.jsonl` 예시:

```json
{
  "queryId": "q_api_001",
  "domain": "api_spec_migration",
  "topK": [
    { "attestationId": "att_api_responses_001", "score": 11.8, "rank": 1 },
    { "attestationId": "att_api_chat_legacy_002", "score": 5.1, "rank": 2 }
  ],
  "expectedListingIds": ["att_api_responses_001"],
  "hitAt1": true,
  "hitAt3": true,
  "mrr": 1,
  "ndcgAt5": 1,
  "noMatchExpected": false,
  "noMatchPredicted": false,
  "scoreBreakdown": {
    "domain": 3,
    "keywords": 2,
    "freshness": 0.8
  }
}
```

`benchmark-v2-results.jsonl`은 retrieval 결과를 참조만 한다.

```json
{
  "queryId": "q_api_001",
  "retrievalRunId": "20260529T000000Z",
  "retrievalJudgment": "exact",
  "cttReduction": 0.83
}
```

## 7. 프로젝트에 바로 적용 가능한가

가능하다. 단, 두 단계로 나누는 것이 맞다.

### 7.1 Offline benchmark 먼저

API DB를 건드리지 않고 fixture만으로 ranking을 돌린다.

장점:

- API key, Supabase, IPFS, chain 없이 실행 가능
- score 가중치 조정이 빠름
- NO_MATCH/decoy 케이스를 통제 가능
- token benchmark와 독립된 결과를 낼 수 있음

### 7.2 API search 개선은 그 다음

offline benchmark가 안정되면 API 검색에 다음을 추가한다.

```text
rank_score
matched_fields
search_mode
no_match_threshold
```

Postgres 쪽 개선 후보:

```text
tsvector + ts_rank
pg_trgm similarity
metadata JSONB weighted field score
freshness boost
```

주석: 운영 API에 바로 embedding 검색을 넣기 전에 deterministic lexical baseline을 먼저 확보해야 개선 효과를 비교할 수 있다.

## 8. 최종 판정

현재 프로젝트에는 검색 기능은 있지만, "매칭 기반 알고리즘"이라고 부를 수 있는 별도 ranking/evaluation layer는 없다.

따라서 다음은 새로 작성해야 한다.

```text
1. offline matcher
2. retrieval benchmark runner
3. retrieval fixture with expectedListingIds/relevance
4. retrieval summary reporter
```

이 작업은 토큰 절감 benchmark와 겹치지 않는다. 같은 query/listing fixture를 참조할 수는 있지만, output과 pass/fail 기준은 별도다.
