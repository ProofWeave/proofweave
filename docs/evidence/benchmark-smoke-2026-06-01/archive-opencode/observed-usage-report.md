# ProofWeave Smoke Benchmark Observed Usage Report

작성일: 2026-06-01

## 결론

OpenCode에서도 사용량 관측은 가능하다. 따라서 이 보고서는 `provider billing`이 아니라 `observed usage` 기준으로 숫자를 정리한다.

단, 세 모델의 usage source가 같지는 않다. Claude는 OpenCode request usage가 남아 있지 않아 `offline_ctt` proxy이고, GPT/Gemini는 OpenCode request logs 기반이다. 따라서 외부 claim에는 "OpenCode observed/proxy"라는 라벨을 반드시 붙여야 한다.

## Model Status Matrix

| Model | Status | usageSource | Provider billing claim | Pair count | Saving eligible | Mean input reduction | Mean total reduction |
|---|---|---|---|---:|---:|---:|---:|
| Claude Opus 4.8 | complete | `offline_ctt` | no | 5 | 4 | 66.92% | 63.67% |
| GPT-5.5 Fast High | complete | `opencode_request_usage` | no | 5 | 4 | 63.58% | 2.38% |
| Gemini 3.5 Flash | log_complete_summary_derived | `opencode_request_usage` | no | 5 | 4 | 10.09% | 1.21% |

## Observed Usage Totals

| Model | Metric basis | Raw input | PW input | Raw total | PW total | Raw observed cost | PW observed cost |
|---|---|---:|---:|---:|---:|---:|---:|
| Claude Opus 4.8 | offline_ctt | 3606 | 1193 | 4315 | 1569 | n/a | n/a |
| GPT-5.5 Fast High | opencode_request_usage | 80461 | 29534 | 111681 | 109023 | n/a | n/a |
| Gemini 3.5 Flash | opencode_request_usage | 31875 | 28657 | 134939 | 133298 | $0.113151 | $0.122720 |

## Interpretation

- Claude shows the strongest proxy reduction, but it is `offline_ctt`, not Anthropic billing usage.
- GPT shows strong input-token reduction, but total-token reduction is small because OpenCode request totals include reasoning/cache/runtime overhead.
- Gemini request logs show only modest input/total reduction and observed cost is higher on the ProofWeave path for the saving-eligible subset. This means Gemini cannot be used as a positive cost-saving claim from the current OpenCode run.
- Current evidence is enough for an internal smoke report, not enough for a landing-page billing-savings claim.

## Cost Accounting Warning

The Gemini request logs sum to a local OpenCode logged cost of about `$0.282340`
across the 10 canonical request logs, while the user observed about `$15` of
account spend during the broader run. Treat these as different accounting
surfaces:

- `request log cost`: parsed from the 10 local JSONL request logs only.
- `user-observed spend`: likely includes earlier failed/fallback/probe calls,
  session/runtime overhead, dashboard/account aggregation, or other OpenCode
  billing scope not present in the 10 JSONL files.

Therefore the report uses the local request-log numbers for per-query analysis,
but the operational conclusion is stricter: do not run more OpenCode live
benchmark calls until a hard cost cap and direct API/count harness exist.

## Query Set Mismatch

Claude query set:

- bq_full_001
- bq_full_007
- bq_full_013
- bq_full_025
- bq_full_040

GPT/Gemini query set:

- bq_full_013
- bq_full_019
- bq_full_025
- bq_full_031
- bq_full_037

Because Claude used a different query set, do not publish a direct three-model comparison. Use GPT/Gemini for same-set OpenCode observed comparison, and Claude as a separate smoke run.

## Visualization Recommendation

Use these charts:

1. Model status matrix: complete / derived / incomplete, with usage source.
2. Input reduction vs total reduction: show how OpenCode overhead reduces the apparent total saving.
3. Observed cost bar chart for Gemini: raw vs ProofWeave, showing that current observed cost is not favorable.
4. Query set overlap chart: Claude set vs GPT/Gemini set.
5. Evidence quality ladder: provider billing metadata, provider count API, OpenCode request usage, offline CTT.

Claude coworker can build the dashboard/slide, but only from `chart-data.json` and `chart-data.csv`. Do not let the visualization worker recalculate benchmark numbers.
