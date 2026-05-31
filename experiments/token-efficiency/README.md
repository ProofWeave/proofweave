# ProofWeave Token Efficiency Harness

This harness implements the experiment defined in
[`../../token-efficiency-experiment-setup.md`](../../token-efficiency-experiment-setup.md).
It is intentionally a standalone TypeScript package so the experiment can be run
without touching `api/` or `cli/` runtime code.

## Status

Phase 1 (offline canonical token counting) is implemented and runnable on the
seed fixture.

Benchmark v2 is also implemented as an offline-only extension. It keeps token
context savings separate from retrieval/matching quality:

- `run-benchmark-v2.ts` counts raw source, matched artifact, and retrieved
  top-k artifact context tokens.
- `run-benchmark-v2.ts` also writes visualization-ready model/domain CSV files
  and a deterministic quality proxy based on fixture rubrics.
- `run-retrieval-benchmark.ts` evaluates Hit@K, MRR, no-match precision, and
  domain-level retrieval summaries.
- No provider API is called. Provider usage is represented only as a
  future/live-mode extension point.

Phases 2 to 5 are described in the setup document and are not implemented here
yet.

## Phases

| Phase | What it does | Implemented |
|---|---|---|
| 0 | Author query/listing fixtures and raw source bundles + artifacts | yes for v2 full fixture |
| 1 | Offline CTT/CB counting for `raw_workflow` vs `proofweave_workflow` | yes |
| 2 | Provider count APIs (OpenAI tiktoken, Anthropic count_tokens, Gemini countTokens) | no |
| 3 | Live paired LLM runs with usage metadata, latency, quality | no |
| 4 | Price-sensitivity sweep over `data_price` | no |
| 5 | Marketplace decision per listing kind | no |

## Benchmark v2 model set

The v2 fixture and scripts intentionally fix the model comparison set to these
three model ids:

- `claude-opus-4.8`
- `gpt-5.5-fast-high`
- `gemini-3.5-flash`

The fixture validator fails if a v2 run adds, removes, or renames a model. The
current scripts do not call Anthropic, OpenAI, or Google APIs; all token counts
are local context-token proxies.

`modelId` is the benchmark label. For paid live runs, map each label to the
current provider API model id first. See
[`docs/live-model-cost-token-plan.md`](docs/live-model-cost-token-plan.md).

## Directory layout

```
experiments/token-efficiency/
  README.md
  package.json
  tsconfig.json
  fixtures/
    benchmark-v2.full.json
    benchmark-v2.sample.json
    queries.seed.jsonl
    listings.seed.jsonl
    v2-full/
      source-bundles/
      artifacts/
    source-bundles/
    artifacts/
  scripts/
    benchmark-v2-utils.ts
    generate-benchmark-v2-dataset.mjs
    count-canonical.ts
    run-benchmark-v2.ts
    run-paired-benchmark.ts
    run-retrieval-benchmark.ts
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

## Benchmark v2 fixture format

`fixtures/benchmark-v2.full.json` is now the default v2 fixture. It contains
6 domains, 18 listings, 42 queries, 6 no-match edge queries, quality rubrics,
retrieval judgments, and top-k retrieval snapshots.

`fixtures/benchmark-v2.sample.json` remains a compact schema sample. Both
fixtures contain:

- `scenarioConfig` — default top-k, offline-only flag, and live provider usage
  extension marker.
- `modelConfig` — the fixed model set:
  `claude-opus-4.8`, `gpt-5.5-fast-high`, `gemini-3.5-flash`.
- `queries` — benchmark queries with `expectedListingIds`.
- `listings` — minimal marketplace listing records with raw source bundle and
  artifact paths.
- `retrievalJudgments` — relevance labels used only by retrieval scoring.
- `retrievedTopK` — fixture top-k results used by the token benchmark and by
  retrieval scoring when `--source=fixture`.

Example commands:

```bash
cd experiments/token-efficiency
npm run dataset:v2
npm run benchmark:v2 -- --iterations=3 --top-k=3
npm run retrieval:v2 -- --source=fixture --top-k=3
npm run retrieval:v2 -- --source=matcher --top-k=3 --matcher-min-score=1
```

To write machine-readable outputs without touching the repository output
folder, pass an absolute temporary directory:

```bash
npm run benchmark:v2 -- --out-dir=/tmp/proofweave-token-benchmark-v2
npm run retrieval:v2 -- --out-dir=/tmp/proofweave-retrieval-benchmark-v2
```

`run-benchmark-v2.ts` writes these files when `--out-dir` is provided:

- `benchmark-v2-results.jsonl`
- `benchmark-v2-summary.json`
- `benchmark-v2-model-summary.csv`
- `benchmark-v2-domain-summary.csv`
- `benchmark-v2-summary.md`

Each scenario result sets `providerUsage` to `null` and
`providerUsageMode` to `future_live_mode_extension_only`. It also includes
`qualityScore`, `qualityPass`, and `qualityCoverage` for charting.

`run-retrieval-benchmark.ts` writes these files when `--out-dir` is provided:

- `retrieval-results.jsonl`
- `retrieval-summary.json`
- `retrieval-domain-summary.csv`
- `retrieval-summary.md`

It supports two sources:

- `fixture` — read the curated `retrievedTopK` rows from the fixture.
- `matcher` — run a deterministic local lexical matcher over listing title,
  tags, synopsis, and artifact text.

The full fixture includes one no-match query per domain so the benchmark checks
more than happy-path retrieval.

## Benchmark v2 docs

- [`docs/benchmark-reference.md`](docs/benchmark-reference.md) — benchmark
  structure and metric definitions.
- [`docs/domain-dataset-research.md`](docs/domain-dataset-research.md) —
  domain-level dataset research.
- [`docs/dataset-acquisition-log.md`](docs/dataset-acquisition-log.md) —
  actual filled v2 fixture scope and source policy.
- [`docs/retrieval-matching-algorithm.md`](docs/retrieval-matching-algorithm.md)
  — retrieval/matching benchmark separation.
- [`docs/live-model-cost-token-plan.md`](docs/live-model-cost-token-plan.md) —
  how to measure API token usage and cost for paid model runs.
