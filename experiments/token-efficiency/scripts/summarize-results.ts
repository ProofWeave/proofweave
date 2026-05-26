// CLI:
//   tsx scripts/summarize-results.ts [--run=<dir>] [--bootstrap=N] [--seed=N]
// Reports mean/median/p10/p90 of ctt_reduction plus a paired bootstrap 95%
// CI on the median and mean (default 2000 resamples, deterministic seed).
// Emits summary.md and summary.json into the run directory.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RUNS = join(ROOT, "outputs", "runs");

interface RunRecord {
  queryId: string;
  domain: string;
  matched: boolean;
  raw_workflow: { ctt: number; cb: number; ctt_method: string };
  proofweave_workflow: { ctt: number; cb: number; ctt_method: string } | null;
  ctt_reduction: number | null;
  cb_reduction: number | null;
}

interface QualityRecord {
  queryId: string;
  artifact_must_include_coverage: number;
  artifact_must_not_hallucinate_hits: string[];
  quality_proxy_pass: boolean;
}

interface Args {
  run: string | null;
  bootstrap: number;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  let run: string | null = null;
  let bootstrap = 2000;
  let seed = 1;
  for (const a of argv) {
    if (a.startsWith("--run=")) run = a.slice("--run=".length);
    else if (a.startsWith("--bootstrap=")) bootstrap = Number(a.slice("--bootstrap=".length));
    else if (a.startsWith("--seed=")) seed = Number(a.slice("--seed=".length));
  }
  return { run, bootstrap, seed };
}

function resolveRunDir(explicit: string | null): string {
  if (explicit) return resolve(explicit);
  const pointer = join(RUNS, "latest.txt");
  if (!existsSync(pointer)) {
    throw new Error(
      "no latest run found. Run `run-paired-benchmark.ts` first or pass --run=<dir>.",
    );
  }
  return readFileSync(pointer, "utf8").trim();
}

function loadJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function median(xs: number[]): number {
  return quantile(xs, 0.5);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapCI(
  xs: number[],
  n: number,
  seed: number,
  stat: (sample: number[]) => number,
): { lo: number; hi: number } {
  if (xs.length === 0) return { lo: NaN, hi: NaN };
  const rand = mulberry32(seed);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const draw: number[] = [];
    for (let j = 0; j < xs.length; j++) {
      const idx = Math.floor(rand() * xs.length);
      draw.push(xs[idx]!);
    }
    samples.push(stat(draw));
  }
  return { lo: quantile(samples, 0.025), hi: quantile(samples, 0.975) };
}

function pct(n: number, digits = 2): string {
  if (!isFinite(n)) return "n/a";
  return (n * 100).toFixed(digits) + "%";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = resolveRunDir(args.run);
  const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
  const records = loadJsonl<RunRecord>(join(runDir, "raw-results.jsonl"));
  const qPath = join(runDir, "quality-results.jsonl");
  const quality = existsSync(qPath) ? loadJsonl<QualityRecord>(qPath) : [];
  const qualityById = new Map(quality.map((q) => [q.queryId, q]));

  const matched = records.filter((r) => r.matched && r.ctt_reduction !== null);
  const cttReductions = matched.map((r) => r.ctt_reduction as number);
  const cbReductions = matched.map((r) => r.cb_reduction as number);

  const ciMedian = bootstrapCI(cttReductions, args.bootstrap, args.seed, median);
  const ciMean = bootstrapCI(cttReductions, args.bootstrap, args.seed + 1, mean);

  const rawTokensTotal = matched.reduce((a, r) => a + r.raw_workflow.ctt, 0);
  const pwTokensTotal = matched.reduce(
    (a, r) => a + (r.proofweave_workflow?.ctt ?? 0),
    0,
  );
  const totalReduction = rawTokensTotal === 0 ? 0 : 1 - pwTokensTotal / rawTokensTotal;

  const passCount = quality.filter((q) => q.quality_proxy_pass).length;
  const coverageMean = mean(
    quality.map((q) => q.artifact_must_include_coverage),
  );
  const hallucinationFlagged = quality.filter(
    (q) => q.artifact_must_not_hallucinate_hits.length > 0,
  );

  const summaryJson = {
    runDir,
    ctt_method: meta.ctt_method,
    n_queries: records.length,
    n_matched: matched.length,
    no_match_rate: records.length === 0 ? 0 : 1 - matched.length / records.length,
    ctt_reduction: {
      mean: mean(cttReductions),
      median: median(cttReductions),
      p10: quantile(cttReductions, 0.1),
      p90: quantile(cttReductions, 0.9),
      bootstrap_median_ci95: ciMedian,
      bootstrap_mean_ci95: ciMean,
      pooled_total: totalReduction,
    },
    cb_reduction: {
      mean: mean(cbReductions),
      median: median(cbReductions),
    },
    quality_proxy: {
      pass: passCount,
      total: quality.length,
      pass_rate: quality.length === 0 ? 0 : passCount / quality.length,
      coverage_mean: coverageMean,
      hallucination_flagged_query_ids: hallucinationFlagged.map((q) => q.queryId),
    },
  };

  writeFileSync(
    join(runDir, "summary.json"),
    JSON.stringify(summaryJson, null, 2),
    "utf8",
  );

  const perQueryRows = records
    .map((r) => {
      const q = qualityById.get(r.queryId);
      const reduction = r.ctt_reduction === null ? "no match" : pct(r.ctt_reduction);
      const coverage = q ? pct(q.artifact_must_include_coverage, 1) : "n/a";
      const hallucination = q && q.artifact_must_not_hallucinate_hits.length > 0
        ? "yes"
        : "no";
      const passed = q ? (q.quality_proxy_pass ? "pass" : "fail") : "n/a";
      return `| ${r.queryId} | ${r.domain} | ${r.raw_workflow.ctt} | ${
        r.proofweave_workflow?.ctt ?? 0
      } | ${reduction} | ${coverage} | ${hallucination} | ${passed} |`;
    })
    .join("\n");

  const ctMethodWarn =
    meta.ctt_method === "bytes_div_4_fallback"
      ? "\n> Token counts use the bytes/4 fallback because `js-tiktoken` is not installed. Numbers are useful for paired comparison but do not equal billing tokens.\n"
      : "";

  const md = `# Phase 1 Summary — ${runDir.split("/").slice(-1)[0]}

Run mode: ${meta.mode}.
Token method: \`${meta.ctt_method}\`.${ctMethodWarn}

## Aggregate CTT reduction (matched queries)

| Statistic | Value |
|---|---|
| n matched | ${matched.length} / ${records.length} |
| mean | ${pct(summaryJson.ctt_reduction.mean)} |
| median | ${pct(summaryJson.ctt_reduction.median)} |
| p10 | ${pct(summaryJson.ctt_reduction.p10)} |
| p90 | ${pct(summaryJson.ctt_reduction.p90)} |
| bootstrap 95% CI (median) | [${pct(ciMedian.lo)}, ${pct(ciMedian.hi)}] |
| bootstrap 95% CI (mean) | [${pct(ciMean.lo)}, ${pct(ciMean.hi)}] |
| pooled total | ${pct(totalReduction)} |

## Quality proxy (must-include coverage on artifact)

| Metric | Value |
|---|---|
| quality proxy pass | ${passCount} / ${quality.length} |
| mean must-include coverage | ${pct(coverageMean, 1)} |
| hallucination-flagged queries | ${
    hallucinationFlagged.length === 0
      ? "none"
      : hallucinationFlagged.map((q) => q.queryId).join(", ")
  } |

## Per-query results

| queryId | domain | raw CTT | pw CTT | reduction | rubric coverage | hallucination hits | proxy verdict |
|---|---|---:|---:|---:|---:|---|---|
${perQueryRows}

## Interpretation rules

- These numbers are Phase 1 offline canonical token counts. They do not
  prove billing-cost savings, do not measure answer quality from a real
  model, and should not be quoted as provider-side token reductions.
- The quality proxy verifies only that the compressed artifact still
  contains the rubric must-include terms. It is a sanity check, not a
  substitute for live evaluation in Phase 3.
- Treat the bootstrap CI as descriptive on this small fixture. With only
  ${matched.length} matched queries the interval is wide; expand the
  fixture to at least 30 matched queries before quoting CIs externally.
`;

  writeFileSync(join(runDir, "summary.md"), md, "utf8");
  console.log(`wrote ${join(runDir, "summary.md")}`);
  console.log(`wrote ${join(runDir, "summary.json")}`);
  console.log(
    `pooled CTT reduction: ${pct(totalReduction)} over ${matched.length}/${records.length} matched queries`,
  );
}

main();
