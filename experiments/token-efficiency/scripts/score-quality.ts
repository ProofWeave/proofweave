// CLI: tsx scripts/score-quality.ts [--run=<dir>]
// Phase 1 quality proxy: for each query, checks whether the artifact
// preserves rubric.mustInclude terms (coverage fraction) and contains none
// of rubric.mustNotHallucinate terms. Writes quality-results.jsonl. This is
// a sanity check, not a substitute for live LLM evaluation in Phase 3.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FIXTURES = join(ROOT, "fixtures");
const RUNS = join(ROOT, "outputs", "runs");

interface RunRecord {
  queryId: string;
  matchListingId: string | null;
  matched: boolean;
  raw_workflow: { files: string[] };
  proofweave_workflow: { files: string[] } | null;
}

interface QueryFixture {
  queryId: string;
  qualityRubric: {
    mustInclude: string[];
    mustNotHallucinate: string[];
    passThreshold: number;
  };
}

interface QualityRecord {
  queryId: string;
  matched: boolean;
  artifact_must_include_total: number;
  artifact_must_include_found: number;
  artifact_must_include_coverage: number;
  artifact_must_not_hallucinate_hits: string[];
  pass_threshold: number;
  quality_proxy_pass: boolean;
}

function parseArgs(argv: string[]): { run: string | null } {
  let run: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--run=")) run = a.slice("--run=".length);
  }
  return { run };
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

function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = resolveRunDir(args.run);

  const records = loadJsonl<RunRecord>(join(runDir, "raw-results.jsonl"));
  const queries = loadJsonl<QueryFixture>(
    join(FIXTURES, "queries.seed.jsonl"),
  );
  const queryById = new Map(queries.map((q) => [q.queryId, q]));

  const out: QualityRecord[] = [];
  for (const r of records) {
    const q = queryById.get(r.queryId);
    if (!q) continue;
    const rubric = q.qualityRubric;
    const artifactFiles = r.proofweave_workflow ? r.proofweave_workflow.files : [];
    const artifactText = artifactFiles
      .map((f) => readFileSync(join(FIXTURES, f), "utf8"))
      .join("\n");
    const includeTotal = rubric.mustInclude.length;
    const includeFound = artifactText
      ? rubric.mustInclude.filter((t) => containsCI(artifactText, t)).length
      : 0;
    const hallucinationHits = artifactText
      ? rubric.mustNotHallucinate.filter((t) => containsCI(artifactText, t))
      : [];
    const coverage = includeTotal === 0 ? 0 : includeFound / includeTotal;
    out.push({
      queryId: r.queryId,
      matched: r.matched,
      artifact_must_include_total: includeTotal,
      artifact_must_include_found: includeFound,
      artifact_must_include_coverage: coverage,
      artifact_must_not_hallucinate_hits: hallucinationHits,
      pass_threshold: rubric.passThreshold,
      quality_proxy_pass:
        r.matched && coverage >= rubric.passThreshold && hallucinationHits.length === 0,
    });
  }

  const outPath = join(runDir, "quality-results.jsonl");
  writeFileSync(outPath, out.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  const passed = out.filter((r) => r.quality_proxy_pass).length;
  console.log(`wrote ${out.length} quality records to ${outPath}`);
  console.log(`quality proxy pass: ${passed}/${out.length}`);
}

main();
