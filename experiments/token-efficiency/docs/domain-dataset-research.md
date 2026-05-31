# ProofWeave 토큰/검색 벤치마크용 6개 도메인 데이터셋 리서치

이 문서는 `experiments/token-efficiency`의 Phase 0 fixture 확장을 위한 데이터셋 리서치 노트다. 목적은 raw source bundle과 재사용 가능한 artifact를 함께 설계해서, `raw_workflow`와 `proofweave_workflow`의 context 크기, 검색 적중률, no-match 처리, rubric 기반 품질을 비교할 수 있게 만드는 것이다.

작성 기준:

- 언어는 한국어를 기본으로 쓰고, 파일명, API명, 모델명, 명령어, 식별자는 영어로 둔다.
- 6개 도메인은 고정한다.
- 추상 설명보다 `listings.seed.jsonl`, `queries.seed.jsonl`, `fixtures/source-bundles/`, `fixtures/artifacts/`로 옮기기 쉬운 단위로 정리한다.
- source category는 공식 문서, 표준, 규제기관, chain RPC, exchange API 같은 1차 출처를 우선한다.
- 이 문서 작성 시점에 URL/source category 수준으로 확인한 항목도, 실제 fixture 제작 전에는 source revision, effective date, API response sample을 다시 검증해야 한다. 실측값, 최신 법령, API 변경사항, 시장 데이터는 모두 `검증 필요`로 취급한다.

## 1. 공통 fixture 설계

### 1.1 Domain ID 매핑

| 고정 도메인 | 권장 `domain` 값 | 주요 listing kind | 권장 freshness |
|---|---|---|---|
| 최신 API/spec migration | `api_spec_migration` | `skill`, `workflow_recipe`, `raw_evidence_pack` | 7~30일 |
| 온체인/가스/수수료 실측 데이터 | `onchain_fee_measurement` | `curated_dataset`, `raw_evidence_pack`, `skill` | 1~14일 |
| 거래/시장 시계열 데이터 | `market_timeseries` | `curated_dataset`, `raw_evidence_pack` | 1~7일 |
| 법령/규제 비교표 | `regulatory_comparison` | `curated_dataset`, `workflow_recipe` | 30~180일 |
| 보안 배포 체크리스트 | `security_deployment` | `workflow_recipe`, `skill` | 30~120일 |
| Agent skill/prompt/workflow recipe | `agent_workflow` | `skill`, `prompt_template`, `workflow_recipe` | 30~120일 |

### 1.2 Listing 파일명 규칙

현재 harness는 fixture 경로를 `fixtures/` 기준 상대경로로 읽는다. 처음에는 flat 구조를 유지하면 코드 변경 없이 확장할 수 있다.

```text
fixtures/source-bundles/<domain-slug>-<topic-slug>.md
fixtures/artifacts/<domain-slug>-<topic-slug>-<artifact-kind>.md
```

예시:

```text
fixtures/source-bundles/api-openai-responses-migration.md
fixtures/artifacts/api-openai-responses-migration-skill.md
fixtures/source-bundles/fees-ethereum-feehistory-2026w21.md
fixtures/artifacts/fees-ethereum-feehistory-table.md
```

### 1.3 Raw source bundle header

각 raw source bundle은 사람이 나중에 다시 검증할 수 있게 첫 부분에 metadata block을 둔다.

```markdown
# <source bundle title>

- source_type: official_docs | standard_spec | regulator_notice | rpc_capture | exchange_api_capture | chain_explorer_api | repository_snapshot
- source_urls:
  - https://...
- captured_at_utc: 2026-05-29T00:00:00Z
- source_revision: commit hash, doc version, effective date, block range, API response timestamp 중 가능한 값
- verification_status: verified_url_only | verified_content_snapshot | needs_recheck
- license_notes: 재배포 가능 여부, API ToS, attribution 필요 여부
- fixture_owner_notes: fixture 제작자가 판단한 누락/주의사항
```

`verification_status` 권장 의미:

| 값 | 의미 |
|---|---|
| `verified_url_only` | 공식 URL 존재와 source category만 확인. fixture 값은 검증 필요. |
| `verified_content_snapshot` | fixture 제작 시점에 원문 내용, 숫자, 날짜, schema를 저장했고 재현 가능. |
| `needs_recheck` | 최신성/법령/시장 데이터라 실제 benchmark 전에 다시 확인해야 함. |

### 1.4 Query fixture 패턴

도메인당 최소 10~15개 query를 만든다. 권장 구성은 다음과 같다.

| Query type | 비율 | 목적 |
|---|---:|---|
| `matched_direct` | 40% | artifact가 정확히 맞는 질문 |
| `matched_multihop` | 20% | 여러 source section을 조합해야 하는 질문 |
| `freshness_sensitive` | 15% | 최신성, capture date, effective date를 물어보는 질문 |
| `edge_case` | 10% | 단위, timezone, chain reorg, proposal/in-force 구분 등 |
| `no_match` | 15% | 팔면 안 되는 질문, 없는 데이터, 미래 데이터, 허위 spec |

현재 `queries.seed.jsonl` shape에 맞춘 최소 예시는 다음이다.

```json
{
  "queryId": "q_api_001",
  "domain": "api_spec_migration",
  "userQuery": "Chat Completions에서 Responses API로 tool calling 코드를 옮기는 migration checklist가 필요해.",
  "expectedListingKinds": ["skill", "workflow_recipe"],
  "matchListingId": "att_api_001",
  "qualityRubric": {
    "mustInclude": ["POST /v1/responses", "input", "tools", "tool_choice", "max_output_tokens"],
    "mustNotHallucinate": ["/v2/responses", "gpt-6", "functions를 계속 쓰면 됨"],
    "passThreshold": 0.8
  }
}
```

No-match query는 `matchListingId`를 비우거나 생략한다.

```json
{
  "queryId": "q_api_nomatch_001",
  "domain": "api_spec_migration",
  "userQuery": "2027년에 나온 GPT-7 Agent Protocol v3 migration guide가 있으면 살게.",
  "expectedListingKinds": ["skill"],
  "qualityRubric": {
    "mustInclude": ["NO_MATCH"],
    "mustNotHallucinate": ["GPT-7", "Agent Protocol v3", "존재하는 공식 migration"],
    "passThreshold": 1
  }
}
```

현재 Phase 1 quality proxy는 artifact text의 `mustInclude` coverage만 보므로 no-match quality는 live search/answer 평가 Phase에서 별도 scorer가 필요하다. 그래도 no-match fixture는 지금부터 넣어 두는 편이 좋다.

## 2. 최신 API/spec migration

### 2.1 Dataset/listing 후보

| Candidate listing | Kind | Raw bundle 후보 | Artifact 후보 | Fixture 가치 |
|---|---|---|---|---|
| OpenAI `Chat Completions` -> `Responses API` migration | `skill`, `workflow_recipe` | `api-openai-responses-migration.md` | `api-openai-responses-migration-skill.md` | parameter rename, streaming, tool call, structured output 변경을 한 query에서 검증 가능 |
| `MCP` spec/tool/resource/prompt migration matrix | `raw_evidence_pack`, `skill` | `api-mcp-spec-snapshot.md` | `api-mcp-server-authoring-recipe.md` | protocol schema와 agent integration을 함께 묻는 query에 적합 |
| `x402` facilitator/client/server migration recipe | `workflow_recipe` | `api-x402-protocol-facilitator.md` | `api-x402-facilitator-recipe.md` | ProofWeave 결제 도메인과 가까워 검색 relevance 평가에 좋음 |
| `EIP-7702` wallet/account migration checklist | `workflow_recipe`, `raw_evidence_pack` | `api-eip7702-wallet-compat.md` | `api-eip7702-app-checklist.md` | protocol spec과 app migration 차이를 구분하는 query에 적합 |

### 2.2 Raw source 후보

| Source category | 1차 source 후보 | 수집 형태 | 검증 상태 |
|---|---|---|---|
| Official API migration docs | OpenAI Responses API migration guide: `https://platform.openai.com/docs/guides/migrate-to-responses` | 주요 section snapshot, old/new API field table, code samples | URL 확인. 실제 parameter, model support, deprecation date는 fixture 제작 시 검증 필요 |
| Official API reference | OpenAI Responses API reference: `https://platform.openai.com/docs/api-reference/responses` | endpoint, request/response schema, streaming event type | 검증 필요 |
| Standard/spec repository | MCP official repository: `https://github.com/modelcontextprotocol/modelcontextprotocol` | spec version, schema file, changelog commit hash | URL 확인. commit pin 필요 |
| Protocol repository/docs | x402 foundation repository: `https://github.com/x402-foundation/x402`, CDP x402 docs: `https://docs.cdp.coinbase.com/x402/` | protocol flow, facilitator role, SDK examples | URL 확인. version pin 필요 |
| EIP/spec | `https://eips.ethereum.org/EIPS/eip-7702`, Ethereum.org Pectra 7702 guide | EIP status, transaction format, wallet compatibility notes | URL 확인. activation/network status는 검증 필요 |

### 2.3 Artifact 형태

권장 artifact는 `skill` 또는 `workflow_recipe`다. 요약문보다 migration task를 실제로 수행하게 만드는 구조가 좋다.

```markdown
# SKILL: Migrate <old API/spec> to <new API/spec>

## When to use
- <trigger query>

## Source snapshot
- captured_at_utc:
- source_revision:
- official_sources:

## Migration matrix
| Old | New | Required change | Test assertion | Source |

## Code-change recipe
1. Detect old usage.
2. Replace request shape.
3. Replace response parsing.
4. Update streaming/tool-call handling.
5. Run compatibility tests.

## Edge cases
- stale SDK version
- renamed field with same semantic meaning
- security/auth change

## Validation
- commands:
- expected failing cases:
```

### 2.4 Query 유형

| Query type | 예시 |
|---|---|
| endpoint migration | "`/v1/chat/completions` 기반 코드를 `POST /v1/responses`로 옮길 때 request/response 차이만 뽑아줘." |
| parameter rename | "`messages`, `max_tokens`, `functions`를 새 API에서 어떻게 바꿔야 해?" |
| streaming migration | "기존 SSE parser가 `choices[0].delta.content`를 보는데 새 event 처리표가 필요해." |
| security/auth migration | "`MCP` server auth가 들어간 tool call migration checklist가 필요해." |
| spec compatibility | "`EIP-7702` 지원 wallet에서 기존 EOA 가정이 깨지는 지점만 정리해줘." |
| no-match | "공식 `GPT-7 Agent Protocol v3` migration guide가 있으면 사겠다." |

### 2.5 Decoy/no-match 설계

| Decoy | 설계 의도 | 기대 동작 |
|---|---|---|
| 존재하지 않는 version | `Responses API v2`, `MCP 3.0`, `GPT-7` | no-match 또는 "검증된 listing 없음" |
| outdated API와 최신 API 혼합 | `functions`를 새 endpoint의 권장 방식이라고 주장 | artifact가 stale claim을 배제 |
| unofficial blog-only source | 공식 source 없이 migration 날짜/field를 단정 | raw-backed listing보다 낮은 ranking |
| 비슷한 protocol 혼동 | `x402`와 일반 HTTP 402 status 설명을 혼합 | 결제 protocol source가 없는 경우 no-match |

### 2.6 품질 rubric 예시

```json
{
  "queryId": "q_api_spec_001",
  "domain": "api_spec_migration",
  "userQuery": "OpenAI tool calling 코드를 Chat Completions에서 Responses API로 옮기는 checklist가 필요해.",
  "expectedListingKinds": ["skill", "workflow_recipe"],
  "matchListingId": "att_api_openai_responses_001",
  "qualityRubric": {
    "mustInclude": ["POST /v1/responses", "input", "tools", "tool_choice", "max_output_tokens", "source_revision"],
    "mustNotHallucinate": ["/v2/responses", "gpt-6", "functions를 그대로 사용"],
    "passThreshold": 0.83
  }
}
```

## 3. 온체인/가스/수수료 실측 데이터

### 3.1 Dataset/listing 후보

| Candidate listing | Kind | Raw bundle 후보 | Artifact 후보 | Fixture 가치 |
|---|---|---|---|---|
| Ethereum `eth_feeHistory` percentile sample | `curated_dataset`, `raw_evidence_pack` | `fees-ethereum-feehistory-<range>.md` | `fees-ethereum-feehistory-table.md` | block range, percentile, base fee, priority fee 단위 검증 |
| Base transaction fee receipt sample | `curated_dataset` | `fees-base-receipts-<range>.md` | `fees-base-total-cost-table.md` | L2 execution fee와 L1 data fee 혼동 decoy 설계 가능 |
| Solana `getRecentPrioritizationFees` sample | `curated_dataset`, `skill` | `fees-solana-priority-fee-<slot-range>.md` | `fees-solana-priority-fee-skill.md` | micro-lamports per CU 단위와 recent-window 한계 검증 |
| EIP-4844 blob fee sample | `curated_dataset` | `fees-ethereum-blob-fee-<range>.md` | `fees-blob-fee-analysis-table.md` | execution gas와 blob gas 분리 질문에 적합 |

### 3.2 Raw source 후보

| Source category | 1차 source 후보 | 수집 형태 | 검증 상태 |
|---|---|---|---|
| Ethereum execution RPC | Ethereum Execution APIs: `https://ethereum.github.io/execution-apis/` | `eth_feeHistory`, `eth_getBlockByNumber`, `eth_getTransactionReceipt` response JSON | API method 존재 확인. 실제 block sample은 검증 필요 |
| Solana RPC | Solana `getRecentPrioritizationFees`: `https://solana.com/docs/rpc/http/getrecentprioritizationfees` | slot, account set, `prioritizationFee`, capture endpoint | 검증 필요 |
| L2 official config | Base configuration changelog: `https://docs.base.org/base-chain/network-information/configuration-changelog` | minimum base fee, gas limit/config changes, effective date | URL 확인. 값은 fixture 시점 재검증 필요 |
| Chain explorer/provider API | Etherscan/BaseScan API, public RPC provider response | receipt, gasUsed, effectiveGasPrice, l1Fee fields | provider별 field 차이 검증 필요 |
| Node-local capture | self-hosted or paid RPC node logs | request/response JSONL with block hash | 재현성 가장 높음. RPC endpoint와 chain head 기록 필요 |

### 3.3 Artifact 형태

권장 artifact는 표준화된 `curated_dataset`과 사용법 `skill`의 조합이다.

```markdown
# Curated Dataset: <chain> fee measurements

## Capture manifest
- chain_id:
- network:
- rpc_methods:
- block_or_slot_range:
- captured_at_utc:
- rpc_provider:
- finality_policy:
- unit_policy:

## Normalized schema
| column | type | unit | source field | notes |

## Data table
| block_number | block_hash | base_fee_wei | priority_fee_p50_wei | gas_used_ratio | source |

## Known limits
- pending/latest block reorg risk
- provider retention limit
- missing receipt handling

## Query answer rules
- 단위를 반드시 유지한다.
- `estimated`, `measured`, `simulated`를 분리한다.
```

### 3.4 Query 유형

| Query type | 예시 |
|---|---|
| percentile lookup | "지난 200 blocks 기준 Ethereum priority fee p50/p90이 어떻게 달라졌어?" |
| fee component breakdown | "Base에서 이 tx의 total fee를 L2 execution과 L1 data fee로 나눠줘." |
| unit conversion | "Solana priority fee를 micro-lamports per CU에서 SOL 단위 총액으로 계산해줘." |
| freshness-sensitive | "오늘 오전 slot range의 priority fee sample이 있으면 그걸 써줘." |
| edge case | "reorg 가능성이 있는 `latest` block sample은 benchmark에서 어떻게 처리해?" |
| no-match | "2026-06-30 이후 Base fee 실측 데이터가 있으면 사겠다." |

### 3.5 Decoy/no-match 설계

| Decoy | 설계 의도 | 기대 동작 |
|---|---|---|
| 단위 혼동 | wei, gwei, lamports, micro-lamports per CU 혼합 | artifact가 단위와 계산식을 명시 |
| estimated vs measured 혼동 | gas estimator output을 receipt 실측값처럼 둠 | measured source가 아니면 낮은 품질 |
| unsupported time range | RPC retention 밖 slot/block 요청 | no-match 또는 "raw capture 없음" |
| wrong network | Base Sepolia sample을 Base mainnet으로 labeling | chain_id/network mismatch 검출 |
| future data | capture 이후 날짜 질문 | no-match |

### 3.6 품질 rubric 예시

```json
{
  "queryId": "q_fee_001",
  "domain": "onchain_fee_measurement",
  "userQuery": "Ethereum mainnet 최근 200 blocks의 base fee와 priority fee percentile 표가 필요해.",
  "expectedListingKinds": ["curated_dataset", "raw_evidence_pack"],
  "matchListingId": "att_fee_eth_001",
  "qualityRubric": {
    "mustInclude": ["eth_feeHistory", "block_or_slot_range", "base_fee_wei", "priority_fee_percentiles", "captured_at_utc", "unit_policy"],
    "mustNotHallucinate": ["고정 gas price", "Solana lamports", "future block"],
    "passThreshold": 0.86
  }
}
```

## 4. 거래/시장 시계열 데이터

### 4.1 Dataset/listing 후보

| Candidate listing | Kind | Raw bundle 후보 | Artifact 후보 | Fixture 가치 |
|---|---|---|---|---|
| Coinbase Exchange spot candles | `curated_dataset`, `raw_evidence_pack` | `market-coinbase-btc-usd-candles-<range>.md` | `market-coinbase-candles-table.md` | 공식 exchange API limit, missing candle policy 검증 |
| Kraken OHLC + trades reconciliation | `curated_dataset` | `market-kraken-ethusd-ohlc-trades-<range>.md` | `market-kraken-ohlc-quality-report.md` | OHLC와 trades source 차이를 비교하는 query 가능 |
| Binance Spot klines/order book snapshot | `curated_dataset` | `market-binance-btcusdt-klines-<range>.md` | `market-binance-kline-spread-table.md` | exchange별 symbol format decoy 설계 |
| DEX pool swap time-series | `curated_dataset`, `raw_evidence_pack` | `market-uniswap-pool-swaps-<range>.md` | `market-dex-pool-timeseries.md` | centralized exchange vs onchain log source 구분 |

### 4.2 Raw source 후보

| Source category | 1차 source 후보 | 수집 형태 | 검증 상태 |
|---|---|---|---|
| Exchange REST candles | Coinbase Exchange `Get product candles`: `https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles` | raw response, request params, pagination/window policy | URL/content 일부 확인. 실제 data capture 검증 필요 |
| Exchange REST OHLC | Kraken OHLC: `https://docs.kraken.com/api/docs/rest-api/get-ohlc-data` | pair, interval, since, server timestamp, response arrays | URL 확인. data capture 검증 필요 |
| Exchange official repository | Binance Spot API docs: `https://github.com/binance/binance-spot-api-docs` | kline endpoint docs, WebSocket stream docs, rate limits | URL 확인. endpoint version pin 필요 |
| WebSocket feed | official exchange WebSocket docs | sampled ticks/order book with sequence IDs | 실시간 capture 재현성 검증 필요 |
| Onchain DEX logs | protocol subgraph, direct `eth_getLogs`, pool contract ABI | block range, pool address, swap events | indexer lag와 reorg handling 검증 필요 |

### 4.3 Artifact 형태

시장 데이터는 요약문보다 normalized table이 benchmark에 유리하다.

```markdown
# Curated Dataset: <venue> <product> time-series

## Capture manifest
- venue:
- product_id:
- market_type: spot | futures | dex_pool
- interval:
- timezone: UTC
- start:
- end:
- source_endpoint:
- request_limit_notes:
- gap_policy:

## Normalized schema
| ts_utc | open | high | low | close | volume | trade_count | source_row_id |

## Derived fields
| ts_utc | vwap | return_pct | spread_bps | source |

## Integrity checks
- row count expected vs actual
- missing intervals
- duplicate timestamp handling
- quote/base asset confirmation
```

### 4.4 Query 유형

| Query type | 예시 |
|---|---|
| OHLC lookup | "Coinbase `BTC-USD` 1h candle에서 특정 기간의 high/low와 volume을 표로 줘." |
| cross-venue comparison | "Kraken `ETH/USD`와 Coinbase `ETH-USD`의 같은 UTC window close price 차이를 계산해줘." |
| data quality | "누락 candle이 있으면 forward-fill하지 말고 gap list를 줘." |
| derived metric | "이 range의 VWAP와 close-to-close return을 계산해줘." |
| edge case | "exchange local timezone이 아니라 UTC 기준으로 잘라줘." |
| no-match | "내일 `BTC-USD` 1m candle 전체를 달라." |

### 4.5 Decoy/no-match 설계

| Decoy | 설계 의도 | 기대 동작 |
|---|---|---|
| symbol mismatch | `BTC-USD`, `XBT/USD`, `BTCUSDT` 혼합 | venue별 product_id를 유지 |
| time zone mismatch | KST window를 UTC row로 착각 | artifact가 timezone conversion을 명시 |
| future window | capture 이후 candle 요청 | no-match |
| spot/futures 혼동 | perpetual funding data를 spot OHLC로 둠 | market_type mismatch 검출 |
| gap hallucination | 누락 interval을 임의 생성 | `gap_policy`에 따라 누락으로 표시 |

### 4.6 품질 rubric 예시

```json
{
  "queryId": "q_market_001",
  "domain": "market_timeseries",
  "userQuery": "Coinbase BTC-USD 1h candles에서 2026-05-20 UTC window의 VWAP와 누락 interval 여부를 알려줘.",
  "expectedListingKinds": ["curated_dataset"],
  "matchListingId": "att_market_coinbase_001",
  "qualityRubric": {
    "mustInclude": ["Coinbase Exchange", "BTC-USD", "UTC", "granularity", "gap_policy", "VWAP"],
    "mustNotHallucinate": ["Binance BTCUSDT", "KST 기준 row", "forward-filled missing candle"],
    "passThreshold": 0.84
  }
}
```

## 5. 법령/규제 비교표

### 5.1 Dataset/listing 후보

| Candidate listing | Kind | Raw bundle 후보 | Artifact 후보 | Fixture 가치 |
|---|---|---|---|---|
| FATF Travel Rule baseline | `raw_evidence_pack`, `workflow_recipe` | `reg-fatf-travel-rule-baseline.md` | `reg-fatf-travel-rule-recipe.md` | global baseline과 country implementation 차이 구분 |
| KR/JP/SG/US/EU Travel Rule comparison | `curated_dataset` | `reg-travel-rule-country-sources.md` | `reg-travel-rule-comparison-table.md` | threshold/effective date/source clause 비교 query에 적합 |
| EU `MiCA`/Transfer of Funds comparison | `curated_dataset` | `reg-eu-mica-tofr.md` | `reg-eu-crypto-reg-table.md` | MiCA와 transfer information rule 혼동 decoy 설계 |
| VASP/CASP licensing duty checklist | `workflow_recipe` | `reg-vasp-casp-licensing-source-pack.md` | `reg-vasp-casp-checklist.md` | 법령 적용 여부 판단 query에 적합하되 legal advice 금지 |

### 5.2 Raw source 후보

| Source category | 1차 source 후보 | 수집 형태 | 검증 상태 |
|---|---|---|---|
| FATF guidance | FATF VA/VASP targeted update: `https://www.fatf-gafi.org/en/publications/Fatfrecommendations/targeted-update-virtual-assets-vasps-2023.html`, FATF updated guidance PDF | Recommendation, interpretive note, Travel Rule baseline | URL 확인. 최신 guidance 여부 검증 필요 |
| Korea regulator | FSC press release on VASP Travel Rule: `https://www.fsc.go.kr/eng/pr010101/77580` | threshold, required fields, effective date, storage duty | URL/content 일부 확인. 법령 원문은 별도 검증 필요 |
| Japan regulator | JFSA Travel Rule notices: `https://www.fsa.go.jp/en/news/2021/20210331/20210331.html`, 2026 jurisdiction update | effective date, covered jurisdictions, VASP obligations | URL 확인. 최신 amendment 검증 필요 |
| Singapore regulator | MAS Notice PSN02 page: `https://www.mas.gov.sg/regulation/notices/psn02-aml-cft-notice---digital-payment-token-service` | notice text, AML/CFT obligations, DPT service scope | 사이트 maintenance로 열람 제한 가능. 검증 필요 |
| US regulator | FinCEN funds Travel Rule Q&A: `https://www.fincen.gov/resources/statutes-regulations/guidance/funds-travel-regulations-questions-answers` | threshold, scope, required retrieval/recordkeeping | URL 확인. crypto-specific applicability는 추가 source 필요 |
| EU law | EUR-Lex Regulation (EU) 2023/1113 and 2023/1114 | article/recital, scope, effective/application dates | URL 확인. consolidated text/effective amendments 검증 필요 |

### 5.3 Artifact 형태

법령/규제 artifact는 "요약"보다 조항 추적 가능한 comparison table이어야 한다.

```markdown
# Curated Dataset: Travel Rule jurisdiction comparison

## Scope
- jurisdictions:
- topic:
- captured_at_utc:
- legal_status_policy: in_force | proposed | guidance | consultation

## Comparison table
| jurisdiction | instrument | status | effective_date | threshold | originator_fields | beneficiary_fields | self_hosted_wallet_policy | source_clause |

## Source notes
- 각 row는 official source URL과 clause/section을 가진다.
- proposal과 in-force rule을 같은 status로 섞지 않는다.

## Answer rules
- 법률 자문으로 단정하지 않는다.
- "검증 필요"인 row는 그대로 표시한다.
- threshold currency와 local currency를 혼동하지 않는다.
```

### 5.4 Query 유형

| Query type | 예시 |
|---|---|
| threshold comparison | "한국/일본/싱가포르/미국/EU Travel Rule threshold만 표로 비교해줘." |
| field requirements | "originator/beneficiary에 필요한 식별자 항목 차이를 알려줘." |
| effective status | "2026년 5월 기준 proposed와 in-force를 분리해서 보여줘." |
| wallet edge case | "self-hosted wallet 전송은 각 jurisdiction에서 어떻게 처리돼?" |
| legal instrument lookup | "`MiCA`와 Regulation (EU) 2023/1113 중 Travel Rule 근거가 어느 쪽인지 구분해줘." |
| no-match | "브라질/인도/남아공 최신 Travel Rule 비교표가 있으면 사겠다." |

### 5.5 Decoy/no-match 설계

| Decoy | 설계 의도 | 기대 동작 |
|---|---|---|
| proposal vs in-force 혼동 | consultation 문서를 현행법처럼 제시 | status field로 구분 |
| jurisdiction mismatch | EU MiCA를 US FinCEN threshold로 답변 | source jurisdiction을 유지 |
| currency mismatch | KRW, JPY, SGD, USD, EUR threshold 혼동 | currency와 amount를 함께 출력 |
| legal advice overreach | "우리 서비스는 규제 대상 아님" 단정 | source-backed comparison만 제공 |
| stale law | 오래된 press release만으로 최신 상태 단정 | `captured_at_utc`와 `검증 필요` 표시 |

### 5.6 품질 rubric 예시

```json
{
  "queryId": "q_reg_001",
  "domain": "regulatory_comparison",
  "userQuery": "KR/JP/SG/US/EU Travel Rule threshold와 required fields 비교표가 필요해. proposed와 in-force는 분리해줘.",
  "expectedListingKinds": ["curated_dataset"],
  "matchListingId": "att_reg_travel_rule_001",
  "qualityRubric": {
    "mustInclude": ["jurisdiction", "instrument", "status", "effective_date", "threshold", "originator_fields", "beneficiary_fields", "source_clause"],
    "mustNotHallucinate": ["법률 자문", "모든 국가는 USD 1,000", "MiCA가 Travel Rule threshold의 유일 근거"],
    "passThreshold": 0.88
  }
}
```

## 6. 보안 배포 체크리스트

### 6.1 Dataset/listing 후보

| Candidate listing | Kind | Raw bundle 후보 | Artifact 후보 | Fixture 가치 |
|---|---|---|---|---|
| UUPS proxy deployment hardening checklist | `workflow_recipe`, `skill` | `sec-uups-openzeppelin-deploy.md` | `sec-uups-deploy-checklist.md` | smart contract deployment query와 직접 연결 |
| Cloud Run API deployment security checklist | `workflow_recipe` | `sec-cloudrun-docker-secrets.md` | `sec-cloudrun-deploy-checklist.md` | ProofWeave API deployment/secrets/ingress와 연결 |
| GitHub Actions OIDC/SLSA provenance checklist | `workflow_recipe` | `sec-ci-slsa-github-oidc.md` | `sec-ci-supply-chain-checklist.md` | supply chain/security deployment query에 적합 |
| x402 payment server hardening checklist | `skill`, `workflow_recipe` | `sec-x402-payment-server-hardening.md` | `sec-x402-server-checklist.md` | 결제 middleware replay/receipt/race-condition 질문에 적합 |

### 6.2 Raw source 후보

| Source category | 1차 source 후보 | 수집 형태 | 검증 상태 |
|---|---|---|---|
| Smart contract upgrade docs | OpenZeppelin Upgrades: `https://docs.openzeppelin.com/upgrades`, OpenZeppelin upgradeable contracts docs | UUPS/Transparent proxy caveats, initializer locking, storage layout rules | URL 확인. exact version 검증 필요 |
| Smart contract security baseline | OWASP Smart Contract Top 10/SCSVS: `https://owasp.org/www-project-smart-contract-top-10/`, `https://scs.owasp.org/` | risk category, checklist item, control mapping | URL 확인. version/license 검증 필요 |
| Container deployment docs | Docker build/security docs: `https://docs.docker.com/build/building/best-practices/`, Cloud Run security/secrets docs | Dockerfile, base image, secret injection, runtime identity | 검증 필요 |
| CI/CD supply chain | SLSA spec: `https://slsa.dev/spec/latest/`, GitHub Actions security hardening docs | provenance, OIDC, least privilege, artifact signing | URL 확인. GitHub doc exact page 검증 필요 |
| Product-specific docs | Base, Etherscan verification, CDP/x402 docs | chain-specific config, contract verification, payment validation | 검증 필요 |

### 6.3 Artifact 형태

보안 artifact는 checklist와 command recipe가 함께 있어야 한다.

```markdown
# Workflow Recipe: <target> deployment security checklist

## Scope
- target:
- environment:
- excludes:
- source_revision:

## Pre-deploy checks
| check_id | check | command/manual step | pass evidence | source |

## Deploy checks
| check_id | check | command/manual step | pass evidence | source |

## Post-deploy checks
| check_id | check | command/manual step | pass evidence | source |

## Rollback/incident checks
| check_id | trigger | action | owner evidence |

## Hard fail conditions
- private key in repo
- uninitialized implementation
- missing role separation
- unauthenticated admin endpoint
```

### 6.4 Query 유형

| Query type | 예시 |
|---|---|
| pre-deploy review | "Base mainnet UUPS proxy 배포 전에 storage layout과 initializer 위험만 체크해줘." |
| secret handling | "Cloud Run에 API secret을 넣을 때 Dockerfile/ENV에 남기지 않는 checklist가 필요해." |
| CI/CD hardening | "GitHub Actions에서 deploy key 없이 OIDC와 provenance로 배포하는 절차를 정리해줘." |
| payment server hardening | "`x402` payment middleware에서 replay/race condition을 막는 배포 checklist가 필요해." |
| edge case | "staging에서는 public ingress인데 production에서는 internal ingress여야 하는지 분리해줘." |
| no-match | "Solana program upgrade authority multisig checklist가 있으면 사겠다." |

### 6.5 Decoy/no-match 설계

| Decoy | 설계 의도 | 기대 동작 |
|---|---|---|
| proxy pattern 혼동 | Transparent proxy check를 UUPS에 그대로 적용 | pattern-specific checklist만 match |
| deprecated practice | private key as GitHub secret, mutable `latest` image tag | artifact가 hard fail로 표시 |
| environment mismatch | staging relaxed rule을 production에도 적용 | environment field로 분리 |
| unsupported stack | Cloud Run artifact로 AWS ECS 질문 처리 | no-match 또는 낮은 relevance |
| checklist-only artifact | command/evidence 없이 원칙만 나열 | quality 낮게 평가 |

### 6.6 품질 rubric 예시

```json
{
  "queryId": "q_sec_001",
  "domain": "security_deployment",
  "userQuery": "UUPS proxy를 Base mainnet에 배포하기 전 storage layout, initializer, upgrade role, verification checklist가 필요해.",
  "expectedListingKinds": ["workflow_recipe", "skill"],
  "matchListingId": "att_sec_uups_001",
  "qualityRubric": {
    "mustInclude": ["UUPS", "_disableInitializers", "storage layout", "upgrade role", "verification", "rollback"],
    "mustNotHallucinate": ["beacon proxy", "constructor initializer만 충분", "private key commit"],
    "passThreshold": 0.86
  }
}
```

## 7. Agent skill/prompt/workflow recipe

### 7.1 Dataset/listing 후보

| Candidate listing | Kind | Raw bundle 후보 | Artifact 후보 | Fixture 가치 |
|---|---|---|---|---|
| Claude Code Skill authoring recipe | `skill`, `workflow_recipe` | `agent-claude-code-skill-authoring.md` | `agent-claude-code-skill-recipe.md` | existing seed와 연결되고 token reduction 효과가 크다 |
| OpenAI Agents SDK guardrails/handoffs recipe | `workflow_recipe`, `skill` | `agent-openai-agents-sdk-guardrails.md` | `agent-openai-guardrails-recipe.md` | tool/handoff/guardrail 용어 정확도 평가에 적합 |
| MCP server authoring/search recipe | `skill`, `workflow_recipe` | `agent-mcp-server-authoring.md` | `agent-mcp-server-recipe.md` | MCP spec과 agent workflow를 이어 검색 relevance 평가 |
| Browser-to-API workflow recipe | `workflow_recipe`, `prompt_template` | `agent-browser-to-api-workflow.md` | `agent-browser-to-api-recipe.md` | raw traffic -> OpenAPI artifact 변환 query에 적합 |

### 7.2 Raw source 후보

| Source category | 1차 source 후보 | 수집 형태 | 검증 상태 |
|---|---|---|---|
| Claude Code skills docs | Claude Code Skills docs: `https://code.claude.com/docs/en/skills` | `SKILL.md` structure, frontmatter, supporting files, context behavior | URL/content 일부 확인. 최신 field 검증 필요 |
| OpenAI Agents SDK docs | OpenAI Agents SDK guide: `https://platform.openai.com/docs/guides/agents-sdk/`, SDK docs | agent, tool, handoff, guardrail, tracing concepts | URL 확인. JS/Python SDK version pin 필요 |
| MCP official docs/spec | `https://github.com/modelcontextprotocol/modelcontextprotocol`, `https://modelcontextprotocol.io/` | tools/resources/prompts/schema, server lifecycle | URL 확인. spec revision pin 필요 |
| Framework docs | Google ADK, Vercel AI SDK, LangGraph official docs | workflow graph, tool invocation, state, memory | 검증 필요 |
| Local recipe source | existing local skills, project scripts, fixture outputs | exact file path, command, expected output | 로컬 source는 repo revision 기록 필요 |

### 7.3 Artifact 형태

Agent domain은 실제로 설치하거나 prompt로 재사용 가능한 artifact가 가장 좋다.

```markdown
---
name: <skill-name>
description: <언제 이 skill을 써야 하는지 한 문장으로 명시>
---

# Skill: <task>

## Use when
- <trigger>

## Inputs
- required:
- optional:

## Workflow
1. Discover context.
2. Load only needed references.
3. Execute or draft artifact.
4. Validate output.

## Supporting files
- `templates/<name>.md`: when to load
- `scripts/<name>.ts`: when to execute

## Output contract
- files:
- response shape:
- refusal/no-match rule:
```

`prompt_template` artifact는 다음 필드를 가져야 한다.

```markdown
# Prompt Template: <task>

## Variables
- `{{source_paths}}`
- `{{target_output}}`
- `{{constraints}}`

## Prompt
<copy-paste 가능한 prompt>

## Quality checks
- must include:
- must not:
```

### 7.4 Query 유형

| Query type | 예시 |
|---|---|
| skill authoring | "`SKILL.md`를 만들 건데 description, supporting files, validation section이 포함된 template이 필요해." |
| prompt refactor | "브라우저 트래픽을 OpenAPI spec으로 바꾸는 copy-paste prompt가 필요해." |
| workflow selection | "이 작업은 MCP tool, skill, slash command 중 뭘로 포장해야 하는지 판단 기준을 줘." |
| guardrail design | "OpenAI Agents SDK에서 tool call 전후 guardrail을 어디에 둬야 해?" |
| edge case | "skill이 너무 커질 때 progressive disclosure로 나누는 기준을 알려줘." |
| no-match | "Codex desktop automation plugin manifest v9 공식 recipe가 있으면 사겠다." |

### 7.5 Decoy/no-match 설계

| Decoy | 설계 의도 | 기대 동작 |
|---|---|---|
| skill vs plugin 혼동 | `SKILL.md` recipe에 plugin manifest 필드를 섞음 | artifact가 개념을 분리 |
| fake frontmatter | 존재하지 않는 field를 필수처럼 제시 | `mustNotHallucinate`로 검출 |
| over-broad prompt | 모든 repo에 적용되는 거대한 prompt | progressive disclosure와 scope 제한 요구 |
| unsupported tool | 현재 harness에 없는 connector/tool 사용 recipe | no-match 또는 "검증 필요" |
| no validation | 실행/검증 단계 없는 prompt | quality 낮게 평가 |

### 7.6 품질 rubric 예시

```json
{
  "queryId": "q_agent_001",
  "domain": "agent_workflow",
  "userQuery": "Claude Code Skill을 만들 때 SKILL.md 구조, description 작성법, supporting files, validation까지 포함한 recipe가 필요해.",
  "expectedListingKinds": ["skill", "workflow_recipe"],
  "matchListingId": "att_agent_claude_skill_001",
  "qualityRubric": {
    "mustInclude": ["SKILL.md", "description", "supporting files", "progressive disclosure", "validation", "output contract"],
    "mustNotHallucinate": ["plugin.json 필수", "모든 reference를 항상 로드", "존재하지 않는 frontmatter 필수"],
    "passThreshold": 0.85
  }
}
```

## 8. Cross-domain decoy 세트

도메인별 decoy 외에 검색 benchmark용 공통 decoy를 별도 query로 넣으면 ranking 품질을 보기 좋다.

| Decoy type | 예시 | 기대 |
|---|---|---|
| same words, wrong domain | "Responses API fee history" | API migration과 gas fee dataset 중 잘못 매칭하지 않아야 함 |
| high freshness demand | "오늘 이후 시장 데이터" | no-match |
| unsupported jurisdiction | "한국/일본/싱가포르 외 남미 전체 Travel Rule 최신표" | no-match 또는 낮은 confidence |
| incompatible artifact kind | "raw tick data가 필요한데 skill만 있음" | `expectedListingKinds` mismatch |
| stale artifact | old capture date가 freshness window 밖 | freshness penalty |
| unit trap | "Solana priority fee를 gwei로 계산" | unit correction 또는 no-match |

## 9. 최소 확장 계획

코드 변경 없이 fixture만 늘리는 기준으로는 다음 구성이 적당하다.

| Domain | listings | queries | no-match queries | edge queries |
|---|---:|---:|---:|---:|
| `api_spec_migration` | 8 | 12 | 2 | 2 |
| `onchain_fee_measurement` | 8 | 12 | 2 | 3 |
| `market_timeseries` | 8 | 12 | 2 | 3 |
| `regulatory_comparison` | 8 | 12 | 2 | 3 |
| `security_deployment` | 8 | 12 | 2 | 2 |
| `agent_workflow` | 8 | 12 | 2 | 2 |
| 합계 | 48 | 72 | 12 | 15 |

이 규모면 기존 seed보다 커지지만, 각 도메인에서 search match, freshness, decoy, artifact compression을 모두 볼 수 있다. `raw_evidence_pack + executable artifact` 구조를 유지해야 ProofWeave가 단순 요약 저장소가 아니라 raw-backed reusable artifact marketplace라는 가설을 검증할 수 있다.

## 10. Fixture 제작 전 검증 checklist

각 listing을 실제 JSONL로 옮기기 전에 아래를 확인한다.

- source URL이 공식/1차 출처인지 확인한다.
- source snapshot의 `captured_at_utc`와 `source_revision`을 기록한다.
- 숫자, threshold, endpoint schema, effective date, block range, timestamp는 원문 또는 raw API response에서 다시 검증한다.
- artifact의 `mustInclude` 항목은 artifact 본문에서 검색 가능해야 한다.
- `mustNotHallucinate` 항목은 stale docs, decoy docs, 자주 틀리는 단위를 포함한다.
- no-match query는 실제로 match listing을 연결하지 않는다.
- 법령/규제 domain은 `legal_status_policy`와 `검증 필요` 표시를 유지한다.
- 시장/온체인 domain은 future data query를 no-match로 둔다.
- security/agent domain은 command 또는 validation step이 없는 artifact를 낮은 품질로 본다.
