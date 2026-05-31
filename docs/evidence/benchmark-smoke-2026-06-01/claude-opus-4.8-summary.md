# Claude Opus 4.8 Smoke Summary

| Field | Value |
|---|---|
| status | complete |
| usageSource | offline_ctt |
| providerBillingClaim | false |
| actualProviderModelId | anthropic/claude-opus-4-8 |
| actualModeOrVariant | default (no explicit variant selected in this session) |
| opencodeAgentProfile | atlas |
| outputDir | /tmp/proofweave-live-benchmark-claude-opus-4.8/smoke |

## Query Set

- bq_full_001
- bq_full_007
- bq_full_013
- bq_full_025
- bq_full_040

## Main Numbers

| Metric | Value |
|---|---:|
| pairCount | 5 |
| savingEligiblePairs | 4 |
| noMatchPairs | 1 |
| qualityFailures | 0 |
| mean input reduction, eligible | 66.92% |
| mean total reduction, eligible | 63.67% |
| aggregate input reduction, eligible | 66.92% |
| aggregate total reduction, eligible | 63.64% |

## Eligible Totals

| Metric | Raw | ProofWeave |
|---|---:|---:|
| input | 3606 | 1193 |
| output | 709 | 376 |
| total | 4315 | 1569 |

## All Rows Totals

| Metric | Raw | ProofWeave |
|---|---:|---:|
| input | 3660 | 1255 |
| output | 797 | 439 |
| total | 4457 | 1694 |

Note: Live answers exist, but token usage is local tiktoken/o200k proxy, not Anthropic billing usage.
