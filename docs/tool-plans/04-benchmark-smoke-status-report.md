# ProofWeave 모델별 Smoke 벤치마크 종합 보고

작성일: 2026-06-01

## 1. 결론

현재 OpenCode 기반 live smoke는 여기서 중단하는 것이 맞다.

확보된 산출물은 제품 판단과 내부 기술 검토에는 쓸 수 있지만, landing page나 외부 발표에서 "provider billing token/cost saving"으로 쓰기에는 부족하다. 이유는 세 모델 모두 provider API usage metadata가 아니며, OpenCode agent runtime overhead 또는 local tokenizer proxy가 섞여 있기 때문이다.

현재 단계에서 가능한 주장은 다음 수준이다.

- ProofWeave artifact path가 raw source path보다 context를 줄일 수 있다는 smoke evidence는 있다.
- GPT와 Gemini의 OpenCode request usage는 agent/runtime overhead가 커서 total token/cost saving claim으로 바로 쓰면 안 된다.
- Claude는 live answer를 만들었지만 token 수치는 offline CTT proxy라 Anthropic billing token이 아니다.
- Gemini는 canonical 10 request log는 있으나 최종 summary artifacts가 아직 없다.

## 2. 모델별 상태

| 모델 | 상태 | 산출물 상태 | usageSource | Provider billing claim |
|---|---|---|---|---|
| Claude Opus 4.8 | smoke 완료 | complete | `offline_ctt` | 불가 |
| GPT-5.5 Fast High | smoke 완료 | complete | `opencode_request_usage` | 불가 |
| Gemini 3.5 Flash | request log만 완료 | incomplete | `opencode_request_usage` log | 불가 |

## 3. Claude Opus 4.8 결과

산출물 위치:

```text
/tmp/proofweave-live-benchmark-claude-opus-4.8/smoke/
```

확인된 파일:

- `live-results.jsonl`
- `live-paired.json`
- `live-summary.json`
- `live-summary.md`
- `model-summary.csv`
- `domain-summary.csv`
- `quality-failures.jsonl`
- `no-match-analysis.md`
- `usage-source-audit.md`
- `full-run-decision.md`
- `run-metadata.json`

실행 identity:

| 항목 | 값 |
|---|---|
| benchmarkModelLabel | `claude-opus-4.8` |
| actualProviderModelId | `anthropic/claude-opus-4-8` |
| actualModeOrVariant | `default` |
| opencodeAgentProfile | `atlas` |
| usedTeamModeOrSubagents | `false` |
| usageSource | `offline_ctt`, `tiktoken_o200k_base` |

Smoke set:

```text
bq_full_001
bq_full_007
bq_full_013
bq_full_025
bq_full_040
```

요약 수치:

| 항목 | 값 |
|---|---:|
| total queries | 5 |
| matched queries | 4 |
| no-match queries | 1 |
| quality failures | 0 |
| mean input-token reduction | 66.92% |
| mean total-token reduction | 63.67% |
| eligible raw total proxy tokens | 4,315 |
| eligible ProofWeave total proxy tokens | 1,569 |

해석:

- Claude smoke는 완료로 볼 수 있다.
- 다만 token 수치는 Anthropic billing token이 아니라 offline CTT proxy다.
- GPT/Gemini와 smoke set이 다르므로 모델 간 직접 비교에는 부적합하다.

## 4. GPT-5.5 Fast High 결과

산출물 위치:

```text
/tmp/proofweave-live-benchmark-gpt-5.5-fast-high/smoke/
```

확인된 파일:

- `live-results.jsonl`
- `live-summary.json`
- `live-summary.md`
- `model-summary.csv`
- `domain-summary.csv`
- `quality-failures.jsonl`
- `no-match-analysis.md`
- `usage-source-audit.md`
- `smoke-set-audit.md`
- `opencode-runs/`
- `opencode-exports/`

실행 identity:

| 항목 | 값 |
|---|---|
| benchmarkModelLabel | `gpt-5.5-fast-high` |
| actualProviderModelId | `openai/gpt-5.5-fast` |
| actualModeOrVariant | `high` |
| requested opencodeAgentProfile | `Atlas` |
| actual opencodeAgentProfile | `Sisyphus - Ultraworker` |
| usedTeamModeOrSubagents | `false` |
| usageSource | `opencode_request_usage` |

Smoke set:

```text
bq_full_013
bq_full_019
bq_full_025
bq_full_031
bq_full_037
```

요약 수치:

| 항목 | 값 |
|---|---:|
| total workflow records | 10 |
| paired queries | 5 |
| saving-evaluated pairs | 4 |
| no-match pairs | 1 |
| quality failures | 0 |
| mean input-token reduction | 63.58% |
| mean total-token reduction | 2.38% |
| raw input tokens, all rows | 80,733 |
| ProofWeave input tokens, all rows | 29,808 |
| raw total tokens, all rows | 138,189 |
| ProofWeave total tokens, all rows | 135,556 |

해석:

- input token 기준으로는 절감 신호가 있다.
- total token 절감은 2.38%로 크게 줄어든다. OpenCode request total에는 reasoning/cache/runtime overhead가 크게 반영되는 것으로 보인다.
- provider billing metadata가 아니므로 OpenAI billing saving claim에는 부적합하다.

## 5. Gemini 3.5 Flash 결과

산출물 위치:

```text
/tmp/proofweave-live-benchmark-gemini/smoke/
```

확인된 파일:

```text
request-logs/01-bq_full_013-raw.jsonl
request-logs/02-bq_full_013-proofweave.jsonl
request-logs/03-bq_full_019-raw.jsonl
request-logs/04-bq_full_019-proofweave.jsonl
request-logs/05-bq_full_025-raw.jsonl
request-logs/06-bq_full_025-proofweave.jsonl
request-logs/07-bq_full_031-raw.jsonl
request-logs/08-bq_full_031-proofweave.jsonl
request-logs/09-bq_full_037-raw.jsonl
request-logs/10-bq_full_037-proofweave.jsonl
```

아직 없는 필수 summary artifacts:

- `live-results.jsonl`
- `live-summary.json`
- `live-summary.md`
- `model-summary.csv`
- `domain-summary.csv`
- `quality-failures.jsonl`
- `no-match-analysis.md`
- `usage-source-audit.md`
- `smoke-set-audit.md`

Smoke set:

```text
bq_full_013
bq_full_019
bq_full_025
bq_full_031
bq_full_037
```

request log 기준 요약 수치:

| 항목 | raw | ProofWeave |
|---|---:|---:|
| input tokens | 38,388 | 35,174 |
| output tokens | 930 | 1,021 |
| reasoning tokens | 5,858 | 7,243 |
| cache read tokens | 121,774 | 121,751 |
| total tokens | 166,950 | 165,189 |
| local logged cost | $0.1369401 | $0.14539965 |

Saving-eligible 4 pairs 기준:

| 항목 | 값 |
|---|---:|
| mean input-token reduction | 10.09% |
| mean total-token reduction | 1.21% |
| raw input tokens | 31,875 |
| ProofWeave input tokens | 28,657 |
| raw total tokens | 134,939 |
| ProofWeave total tokens | 133,298 |
| raw local logged cost | $0.1131507 |
| ProofWeave local logged cost | $0.12272025 |

해석:

- Gemini는 canonical 10 request log는 있다.
- 하지만 summary artifacts가 없으므로 현재 상태는 incomplete로 분류한다.
- local logged cost 기준으로는 ProofWeave path가 raw보다 비싸게 나온 구간도 있다. 이는 cache/reasoning/runtime overhead가 크기 때문이다.
- 사용자가 본 $15 비용과 request log의 `$0.28233975` 합계가 맞지 않는다. OpenCode UI/account total은 probe, failed/fallback call, session overhead, dashboard 집계 기준을 포함할 수 있으므로 local log cost만 믿으면 안 된다.

## 6. 세 모델 비교 시 주의점

현재 산출물은 apples-to-apples 비교가 아니다.

| 문제 | 영향 |
|---|---|
| Claude smoke set이 GPT/Gemini와 다름 | Claude vs GPT/Gemini 직접 비교 불가 |
| Claude usageSource가 `offline_ctt` | GPT/Gemini request usage와 단위가 다름 |
| GPT는 Atlas 요청 후 Sisyphus fallback | agent profile 변수가 섞임 |
| Gemini는 summary artifacts 미완성 | 결과 자동 집계와 품질 검증이 아직 부족 |
| 모든 모델에서 provider billing metadata 없음 | billing/cost saving claim 불가 |
| OpenCode runtime overhead 큼 | total token/cost 절감 수치가 제품 본질보다 agent 실행 구조에 좌우됨 |

따라서 현재 보고서는 "smoke evidence inventory"로 내야 한다. "ProofWeave가 모델별로 X% 비용을 절감했다"는 식의 외부 claim은 금지한다.

## 7. 최종 산출물 패키지 제안

이 단계에서 만들 산출물은 두 층으로 나누는 것이 좋다.

### 7.1 Evidence Package

목적: 재현성과 정직한 한계 기록.

권장 위치:

```text
docs/evidence/benchmark-smoke-2026-06-01/
```

권장 파일:

```text
README.md
model-status-matrix.md
claims-boundary.md
smoke-set-comparison.md
claude-summary.md
gpt-summary.md
gemini-log-summary.md
usage-source-audit.md
cost-risk-note.md
raw-artifact-index.md
```

포함할 내용:

- 각 모델별 output dir
- query set
- usageSource
- provider billing claim 가능 여부
- quality failure 여부
- no-match 처리 여부
- 사용 가능한 수치와 금지 수치

### 7.2 Presentation Package

목적: 내부 공유용으로 빠르게 이해시키기.

권장 위치:

```text
docs/evidence/benchmark-smoke-2026-06-01/visual/
```

권장 파일:

```text
benchmark-smoke-dashboard.html
benchmark-smoke-charts.png
chart-data.json
chart-data.csv
```

시각화는 "성과 과장"보다 "측정 신뢰도와 비용 위험"을 보여주는 방향이 맞다.

## 8. 시각화 제안

추천 차트:

1. Model status matrix
   - Claude: complete / proxy
   - GPT: complete / request proxy
   - Gemini: logs only / incomplete

2. Usage source ladder
   - provider_usage_metadata
   - provider_count_api
   - opencode_request_usage
   - offline_ctt
   - 현재 각 모델이 어느 층에 있는지 표시

3. Input vs total reduction chart
   - GPT/Gemini에서 input reduction은 있어도 total reduction이 작아지는 현상 강조
   - Claude는 다른 단위이므로 별도 색상 또는 separate panel

4. Cost risk chart
   - smoke 5 queries 기준 비용 위험
   - full run은 약 8.4배 이상으로 증가 가능
   - OpenCode full run 금지 근거

5. Smoke set overlap diagram
   - Claude set과 GPT/Gemini set 차이 표시
   - 현재 cross-model comparison이 제한되는 이유 설명

## 9. Claude coworker에 시각화를 맡길지

맡겨도 된다. 다만 역할을 분리해야 한다.

Claude coworker에게 맡길 것:

- 보고서 디자인
- chart layout
- dashboard/slide 구성
- 한글 설명 다듬기
- 시각적 hierarchy 설계

Codex/local script가 맡아야 할 것:

- raw logs 파싱
- 수치 계산
- query set 비교
- usageSource 분류
- provider billing claim 가능 여부 판정
- chart-data.json/csv 생성

이유:

- 시각화 모델에게 raw log 해석과 수치 계산까지 맡기면 hallucination 위험이 커진다.
- 먼저 deterministic chart-data를 만든 뒤, Claude coworker는 그 데이터를 시각적으로 표현하게 하는 것이 안전하다.

## 10. 권장 다음 단계

1. 모든 OpenCode live model call 중단 유지.
2. Gemini request logs에서 summary artifacts를 생성하되, 추가 모델 호출 없이 로컬 파싱만 수행.
3. 세 모델 결과를 `docs/evidence/benchmark-smoke-2026-06-01/`에 evidence package로 정리.
4. 별도 `chart-data.json`을 만들어 시각화 작업의 source of truth로 사용.
5. Claude coworker에는 chart-data 기반 dashboard/slide만 맡긴다.
6. provider-grade 수치가 필요하면 OpenCode가 아니라 직접 API harness를 새로 설계하고, hard cost cap을 먼저 둔다.

## 11. 현재 사용할 수 있는 문구와 금지 문구

사용 가능:

```text
OpenCode smoke runs suggest ProofWeave artifacts can reduce input context, but the current measurements are proxy-level and not provider billing evidence.
```

```text
Claude smoke completed with offline CTT proxy counts; GPT and Gemini request logs show OpenCode runtime overhead significantly affects total-token measurements.
```

금지:

```text
ProofWeave reduces provider billing cost by X%.
```

```text
Gemini/Claude/GPT all verified the same X% saving.
```

```text
Full benchmark confirms marketplace cost savings.
```

```text
100% verifiable or guaranteed savings.
```
