# ProofWeave Token Efficiency Harness

This harness implements the experiment defined in
[`../../token-efficiency-experiment-setup.md`](../../token-efficiency-experiment-setup.md).
It is intentionally a standalone TypeScript package so the experiment can be run
without touching `api/` or `cli/` runtime code.

## Status

Phase 1 (offline canonical token counting) is implemented and runnable on the
seed fixture. Phases 2 to 5 are described in the setup document and are not
implemented here yet.

## Phases

| Phase | What it does | Implemented |
|---|---|---|
| 0 | Author query/listing fixtures and raw source bundles + artifacts | seed fixture only (5 entries) |
| 1 | Offline CTT/CB counting for `raw_workflow` vs `proofweave_workflow` | yes |
| 2 | Provider count APIs (OpenAI tiktoken, Anthropic count_tokens, Gemini countTokens) | no |
| 3 | Live paired LLM runs with usage metadata, latency, quality | no |
| 4 | Price-sensitivity sweep over `data_price` | no |
| 5 | Marketplace decision per listing kind | no |

## Directory layout

```
experiments/token-efficiency/
  README.md
  package.json
  tsconfig.json
  fixtures/
    queries.seed.jsonl
    listings.seed.jsonl
    source-bundles/
    artifacts/
  scripts/
    count-canonical.ts
    run-paired-benchmark.ts
    score-quality.ts
    summarize-results.ts
  outputs/
    runs/<timestamp>/
```

## Token metric

Canonical Text Tokens (`CTT`) and Canonical Bytes (`CB`) follow the setup
document.

The counter prefers `js-tiktoken` with the `o200k_base` encoding. If
`js-tiktoken` is not installed, the harness falls back to a deterministic
`bytes / 4` approximation and tags every record with
`ctt_method = "bytes_div_4_fallback"`. The fallback is good enough to compare
two paired workflows but does not match OpenAI billing token counts and should
not be reported as such.

To run with the real tokenizer:

```bash
cd experiments/token-efficiency
npm install
npm run phase1
```

To run with the fallback (no install required, requires `tsx` available on path
via `npx`):

```bash
cd experiments/token-efficiency
npx --yes tsx scripts/run-paired-benchmark.ts --mode=offline
npx --yes tsx scripts/score-quality.ts
npx --yes tsx scripts/summarize-results.ts
```

All three scripts accept `--run=<dir>` to target an existing run directory
under `outputs/runs/`. With no flag, `run-paired-benchmark.ts` creates a fresh
timestamped run and the other scripts target the latest one.

## Fixture format

`queries.seed.jsonl` — one query per line:

```json
{
  "queryId": "q_001",
  "domain": "api_migration",
  "userQuery": "...",
  "expectedListingKinds": ["skill"],
  "matchListingId": "att_001",
  "qualityRubric": {
    "mustInclude": ["..."],
    "mustNotHallucinate": ["..."],
    "passThreshold": 0.8
  }
}
```

`listings.seed.jsonl` — one listing per line:

```json
{
  "attestationId": "att_001",
  "kind": "skill",
  "title": "...",
  "sourceBundle": ["source-bundles/gpt5-responses.md"],
  "artifactPath": "artifacts/gpt5-responses-skill.md",
  "createdAt": "2026-05-10T00:00:00Z",
  "priceUsdMicros": 250000,
  "freshnessWindowDays": 14
}
```

Paths are resolved relative to `fixtures/`.

## What Phase 1 reports

For every query, the harness records:

- `raw_workflow.ctt`, `raw_workflow.cb` for the full source bundle.
- `proofweave_workflow.ctt`, `proofweave_workflow.cb` for the artifact only.
- `ctt_reduction`, `cb_reduction` per query.
- `must_include_coverage` — fraction of `mustInclude` strings preserved by the
  artifact. This is a Phase 1 proxy for downstream answer quality.

`summarize-results.ts` then computes mean, median, p10, p90, and a paired
bootstrap 95% CI on `ctt_reduction`.

## Expanding to 50 to 100 queries

The seed fixture is intentionally tiny (5 entries) so the harness can be
exercised end-to-end without fabricating evidence. Real Phase 0 work means:

1. Pick at least 5 domains from the setup document.
2. Write 10 to 20 queries per domain with realistic rubrics.
3. For each listing, attach the actual raw source it was derived from.
4. Verify rubric `mustInclude` items are findable in the raw source.

Only after that should the numbers be quoted as anything other than a sanity
check.
