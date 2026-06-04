# Gemini 3.5 Flash Smoke Summary

| Field | Value |
|---|---|
| status | log_complete_summary_derived |
| usageSource | opencode_request_usage |
| providerBillingClaim | false |
| actualProviderModelId | google/gemini-3.5-flash |
| actualModeOrVariant | flash |
| opencodeAgentProfile | Atlas - Plan Executor |
| outputDir | /tmp/proofweave-live-benchmark-gemini/smoke |

## Query Set

- bq_full_013
- bq_full_019
- bq_full_025
- bq_full_031
- bq_full_037

## Main Numbers

| Metric | Value |
|---|---:|
| pairCount | 5 |
| savingEligiblePairs | 4 |
| noMatchPairs | 1 |
| qualityFailures | 0 |
| mean input reduction, eligible | 10.09% |
| mean total reduction, eligible | 1.21% |
| aggregate input reduction, eligible | 10.10% |
| aggregate total reduction, eligible | 1.22% |

## Eligible Totals

| Metric | Raw | ProofWeave |
|---|---:|---:|
| input | 31875 | 28657 |
| output | 763 | 855 |
| reasoning | 4873 | 6381 |
| cache read | 97428 | 97405 |
| total | 134939 | 133298 |
| observed cost, eligible | $0.113151 | $0.122720 |

## All Rows Totals

| Metric | Raw | ProofWeave |
|---|---:|---:|
| input | 38388 | 35174 |
| output | 930 | 1021 |
| reasoning | 5858 | 7243 |
| cache read | 121774 | 121751 |
| total | 166950 | 165189 |

Note: Summary generated locally from existing request logs only. No new model calls were made.
