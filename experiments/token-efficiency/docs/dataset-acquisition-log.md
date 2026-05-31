# Benchmark v2 Dataset Acquisition Log

이 문서는 `fixtures/benchmark-v2.full.json`에 실제로 채운 테스트 데이터셋의 출처와 범위를 기록한다.

## 1. 현재 채운 범위

| 항목 | 수량 |
|---|---:|
| domains | 6 |
| listings | 18 |
| matched queries | 36 |
| no-match edge queries | 6 |
| total queries | 42 |
| raw source bundle files | 18 |
| compressed artifact files | 18 |
| default top-k | 5 |

파일:

- `fixtures/benchmark-v2.full.json`
- `fixtures/v2-full/source-bundles/*.md`
- `fixtures/v2-full/artifacts/*.md`

## 2. 데이터셋 구성 원칙

- 공개 문서 URL을 listing별 `sourceUrls`에 저장했다.
- raw source bundle은 공개 문서의 긴 원문 복사가 아니라, 벤치마크용으로 재작성한 curated source note다.
- artifact는 ProofWeave marketplace에 올라갈 압축 산출물처럼 더 짧게 만들었다.
- 각 query는 `qualityRubric.mustInclude`, `mustNotHallucinate`, `passThreshold`를 가진다.
- no-match query는 토큰 절감 성공률에 포함하지 않고 retrieval/no-match 지표에서만 본다.

## 3. Domain별 출처

| domain | listings | query coverage | primary source URLs |
|---|---:|---:|---|
| `api_spec_migration` | 3 | 6 match + 1 no-match | OpenAI Responses API, OpenAPI examples/spec, Stripe webhook/idempotency docs |
| `onchain_fee_measurement` | 3 | 6 match + 1 no-match | Solana fees/RPC docs, Ethereum gas/JSON-RPC docs, Base/OP Stack fee docs |
| `market_timeseries` | 3 | 6 match + 1 no-match | Kraken OHLC/trades docs, CoinGecko market chart docs, Uniswap/The Graph docs |
| `regulatory_comparison` | 3 | 6 match + 1 no-match | FATF virtual asset guidance, FinCEN Funds Travel Rule Q&A, EU TFR/EBA Guidelines |
| `security_deployment` | 3 | 6 match + 1 no-match | OpenZeppelin upgrades/proxy docs, Foundry test docs, Slither docs |
| `agent_workflow` | 3 | 6 match + 1 no-match | Anthropic Claude Code docs, OpenAI Evals docs, Playwright network + OpenAPI spec docs |

## 4. 데이터셋 플랫폼 사용 판단

Hugging Face Datasets 같은 플랫폼은 fixture를 공유하거나 row slice API로 검증 데이터를 배포하는 데 적합하다. 다만 이번 6개 도메인은 최신 API/규제/보안/수수료 문서의 정확성이 중요하므로, 실제 raw evidence는 공식 문서와 프로젝트성 공개 문서를 우선했다.

공식 참조:

- Hugging Face Dataset Viewer API: https://huggingface.co/docs/dataset-viewer/quick_start
- Hugging Face Hub Datasets docs: https://huggingface.co/docs/hub/datasets

향후 공유가 필요하면 `benchmark-v2.full.json`, `v2-full/source-bundles`, `v2-full/artifacts`를 JSONL/Parquet로 변환해서 Hugging Face private dataset 또는 GitHub release artifact로 올리는 방식이 가장 단순하다.

## 5. 지금 데이터셋의 한계

- raw bundle은 공식 문서의 원문 mirror가 아니라 curated note다.
- 일부 모델 라벨은 provider의 실제 API model id와 아직 매핑하지 않았다.
- 규제 domain은 법률 자문용이 아니라 비교 테스트용이다.
- 시장/온체인 domain은 실시간 가격/수수료를 fetch하지 않고 구조와 rubrics를 고정했다.
- live paid run 전에 source URL과 pricing을 다시 확인해야 한다.
