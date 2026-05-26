// CLI:
//   tsx scripts/run-paired-benchmark.ts [--mode=offline] [--run=<dir>]
// Phase 1 paired offline benchmark: for each query in the seed fixture,
// counts CTT/CB on the raw source bundle and on the matched artifact, then
// writes raw-results.jsonl, fixture-snapshot.json, and meta.json into a new
// timestamped run dir under outputs/runs/.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { countText, type CountResult } from "./count-canonical.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FIXTURES = join(ROOT, "fixtures");
const RUNS = join(ROOT, "outputs", "runs");

interface QueryFixture {
  queryId: string;
  domain: string;
  userQuery: string;
  expectedListingKinds: string[];
  matchListingId?: string;
  qualityRubric: {
    mustInclude: string[];
    mustNotHallucinate: string[];
    passThreshold: number;
  };
}

interface ListingFixture {
  attestationId: string;
  kind: string;
  title: string;
  sourceBundle: string[];
  artifactPath: string;
  createdAt: string;
  priceUsdMicros: number;
  freshnessWindowDays: number;
}

interface RunRecord {
  queryId: string;
  domain: string;
  matchListingId: string | null;
  matched: boolean;
  raw_workflow: {
    files: string[];
    ctt: number;
    cb: number;
    ctt_method: CountResult["ctt_method"];
  };
  proofweave_workflow: {
    files: string[];
    ctt: number;
    cb: number;
    ctt_method: CountResult["ctt_method"];
  } | null;
  ctt_reduction: number | null;
  cb_reduction: number | null;
}

function loadJsonl<T>(path: string): T[] {
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .map((line) => JSON.parse(line) as T);
}

function parseArgs(argv: string[]): { mode: string; run: string | null } {
  let mode = "offline";
  let run: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--mode=")) mode = a.slice("--mode=".length);
    else if (a.startsWith("--run=")) run = a.slice("--run=".length);
  }
  return { mode, run };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

async function sumFiles(files: string[]): Promise<{
  ctt: number;
  cb: number;
  method: CountResult["ctt_method"];
}> {
  let ctt = 0;
  let cb = 0;
  let method: CountResult["ctt_method"] = "bytes_div_4_fallback";
  for (const f of files) {
    const abs = join(FIXTURES, f);
    if (!existsSync(abs)) {
      throw new Error(`fixture file missing: ${abs}`);
    }
    const text = readFileSync(abs, "utf8");
    const c = await countText(text, f);
    ctt += c.ctt;
    cb += c.cb;
    method = c.ctt_method;
  }
  return { ctt, cb, method };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queries = loadJsonl<QueryFixture>(join(FIXTURES, "queries.seed.jsonl"));
  const listings = loadJsonl<ListingFixture>(join(FIXTURES, "listings.seed.jsonl"));
  const listingById = new Map(listings.map((l) => [l.attestationId, l]));

  const runDir = args.run ? resolve(args.run) : join(RUNS, timestamp());
  mkdirSync(runDir, { recursive: true });

  const records: RunRecord[] = [];
  for (const q of queries) {
    const listing = q.matchListingId ? listingById.get(q.matchListingId) ?? null : null;
    const raw = await sumFiles(listing ? listing.sourceBundle : []);
    let proofweave: RunRecord["proofweave_workflow"] = null;
    if (listing) {
      const pw = await sumFiles([listing.artifactPath]);
      proofweave = {
        files: [listing.artifactPath],
        ctt: pw.ctt,
        cb: pw.cb,
        ctt_method: pw.method,
      };
    }
    records.push({
      queryId: q.queryId,
      domain: q.domain,
      matchListingId: q.matchListingId ?? null,
      matched: Boolean(listing),
      raw_workflow: {
        files: listing ? listing.sourceBundle : [],
        ctt: raw.ctt,
        cb: raw.cb,
        ctt_method: raw.method,
      },
      proofweave_workflow: proofweave,
      ctt_reduction:
        listing && raw.ctt > 0 && proofweave
          ? 1 - proofweave.ctt / raw.ctt
          : null,
      cb_reduction:
        listing && raw.cb > 0 && proofweave
          ? 1 - proofweave.cb / raw.cb
          : null,
    });
  }

  const outPath = join(runDir, "raw-results.jsonl");
  writeFileSync(
    outPath,
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    join(runDir, "fixture-snapshot.json"),
    JSON.stringify({ queries, listings }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(runDir, "meta.json"),
    JSON.stringify(
      {
        mode: args.mode,
        createdAt: new Date().toISOString(),
        queries: queries.length,
        listings: listings.length,
        ctt_method: records[0]?.raw_workflow.ctt_method ?? "bytes_div_4_fallback",
      },
      null,
      2,
    ),
    "utf8",
  );

  // Pointer to latest run for downstream scripts.
  writeFileSync(join(RUNS, "latest.txt"), runDir + "\n", "utf8");

  console.log(`wrote ${records.length} records to ${outPath}`);
  console.log(`run dir: ${runDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
