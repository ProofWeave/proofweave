// CLI:
//   tsx scripts/predict-live-from-offline.ts \
//     --offline-dir=/tmp/pw-rebench-offline \
//     --pricing=fixtures/provider-pricing.current.json \
//     [--queries=canonical5|all] [--assumed-output-tokens=150] \
//     [--measured=/path/to/live-results.jsonl]
//
// 목적: live 모델 호출 없이, offline 컨텍스트 토큰(CTT, o200k proxy)으로
//   "통제된 single-shot 하네스가 보일 input/total/cost"를 예측한다.
//   OpenCode와 달리 cache/reasoning/agent-runtime이 없다고 가정하므로
//   total = input + output 만으로 계산한다 (이것이 검증할 falsifiable 예측이다).
//
//   --measured 가 주어지면 해당 (model,query,scenario) row는 예측 대신 실측으로
//   교체하고, 남은 query의 output 가정을 실측 평균으로 재보정한다.
//   ("줄인 데이터셋 live + 나머지 예측" 구조)
//
// 절대: 이 출력은 estimated 이며 provider billing 이 아니다. 가격 미검증 모델은
//   cost 를 내지 않는다(null).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { countText } from "./count-canonical.js";

const CANONICAL5 = ["bq_full_013", "bq_full_019", "bq_full_025", "bq_full_031", "bq_full_037"];

// 모든 호출에 공통으로 붙는 고정 프롬프트(시스템 + 출력 JSON schema). offline CTT에는
// 포함되지 않으므로 별도로 토크나이즈해 input에 더한다. (live-model-cost-token-plan.md §5)
const FIXED_PROMPT = [
  "You are a benchmark answerer. Answer ONLY from the provided context.",
  "Return strict JSON with this schema and nothing else:",
  '{"answer":"string","used_listing_ids":["string"],"missing_evidence":["string"],',
  '"confidence":"low|medium|high","rubric_terms_covered":["string"],"rubric_terms_missing":["string"]}',
  "If the context is insufficient, say so in missing_evidence and do not invent facts.",
].join("\n");

interface Args {
  offlineDir: string;
  pricing: string;
  queries: "canonical5" | "all";
  assumedOutputTokens: number;
  measured: string | null;
  outDir: string | null;
}

function parseArgs(argv: string[]): Args {
  let offlineDir = "/tmp/pw-rebench-offline";
  let pricing = resolve("fixtures/provider-pricing.current.json");
  let queries: Args["queries"] = "canonical5";
  let assumedOutputTokens = 150;
  let measured: string | null = null;
  let outDir: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--offline-dir=")) offlineDir = resolve(a.slice("--offline-dir=".length));
    else if (a.startsWith("--pricing=")) pricing = resolve(a.slice("--pricing=".length));
    else if (a.startsWith("--queries=")) queries = a.slice("--queries=".length) as Args["queries"];
    else if (a.startsWith("--assumed-output-tokens=")) assumedOutputTokens = Number(a.slice("--assumed-output-tokens=".length));
    else if (a.startsWith("--measured=")) measured = resolve(a.slice("--measured=".length));
    else if (a.startsWith("--out-dir=")) outDir = resolve(a.slice("--out-dir=".length));
  }
  return { offlineDir, pricing, queries, assumedOutputTokens, measured, outDir };
}

interface OfflineRow {
  modelId: string;
  queryId: string;
  scenarioId: "raw" | "artifact" | "top_k";
  contextTokensProxy: number;
  expectedNoMatch: boolean;
  cttMethod: string;
}

interface MeasuredRow {
  modelId: string;
  queryId: string;
  scenarioId: "raw" | "artifact";
  inputTokens: number;
  outputTokens: number;
}

function loadOffline(dir: string): OfflineRow[] {
  const text = readFileSync(join(dir, "benchmark-v2-results.jsonl"), "utf8").trim();
  return text.split("\n").map((l) => JSON.parse(l) as OfflineRow);
}

function loadMeasured(path: string | null): MeasuredRow[] {
  if (!path) return [];
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((l) => JSON.parse(l) as MeasuredRow);
}

function pct(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "n/a" : `${(n * 100).toFixed(2)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pricing = JSON.parse(readFileSync(args.pricing, "utf8"));
  const offline = loadOffline(args.offlineDir);
  const measuredRows = loadMeasured(args.measured);
  const overhead = (await countText(FIXED_PROMPT, "fixed-system-schema")).ctt;

  const targetQueries = args.queries === "all" ? null : new Set(CANONICAL5);
  const models = Object.keys(pricing.models);

  // CTT는 모델 무관 동일 → 한 모델(첫 등장)의 raw/artifact만 query별로 집계
  const cttByQuery = new Map<string, { raw: number; artifact: number; noMatch: boolean }>();
  let cttMethod = "unknown";
  for (const r of offline) {
    if (targetQueries && !targetQueries.has(r.queryId)) continue;
    if (r.scenarioId === "top_k") continue;
    cttMethod = r.cttMethod;
    const e = cttByQuery.get(r.queryId) ?? { raw: 0, artifact: 0, noMatch: r.expectedNoMatch };
    if (r.scenarioId === "raw") e.raw = r.contextTokensProxy;
    if (r.scenarioId === "artifact") e.artifact = r.contextTokensProxy;
    e.noMatch = r.expectedNoMatch;
    cttByQuery.set(r.queryId, e);
  }

  // measured 평균 output → 남은 query output 가정 재보정
  const measuredByKey = new Map<string, MeasuredRow>();
  for (const m of measuredRows) measuredByKey.set(`${m.modelId}|${m.queryId}|${m.scenarioId}`, m);
  const calibratedOutput =
    measuredRows.length > 0
      ? Math.round(measuredRows.reduce((s, m) => s + m.outputTokens, 0) / measuredRows.length)
      : args.assumedOutputTokens;

  const report: any = {
    generatedFor: args.queries,
    usageSourceInput: `offline_ctt(${cttMethod}) + fixed_prompt_overhead; cross-model o200k proxy`,
    usageSourceOutput: measuredRows.length > 0 ? "calibrated_from_measured" : "assumption",
    fixedPromptOverheadTokens: overhead,
    assumedOutputTokensPerQuery: calibratedOutput,
    measuredAnchorRows: measuredRows.length,
    note: "ESTIMATE, not provider billing. total=input+output (no cache/reasoning/runtime by design).",
    models: [],
  };

  console.log(`=== predicted live (clean single-shot) from offline CTT ===`);
  console.log(`queries=${args.queries}  fixedOverhead=${overhead}  assumedOutput/query=${calibratedOutput}  measuredRows=${measuredRows.length}`);
  console.log(`usageSource(input)=offline_ctt(${cttMethod})+overhead [cross-model proxy]; cost=ESTIMATE only where price verified-or-template`);
  console.log("model\tin_redux\ttotal_redux\tcost_redux\traw_total_tok\tpw_total_tok\tcost_basis");

  for (const modelId of models) {
    const price = pricing.models[modelId];
    const hasPrice = price.inputPerMtok != null && price.outputPerMtok != null;
    let rawInSum = 0, artInSum = 0, rawTotSum = 0, artTotSum = 0;
    let rawCost = 0, artCost = 0;
    const perQuery: any[] = [];

    for (const [queryId, c] of cttByQuery) {
      if (c.noMatch) continue; // 절감 집계는 no-match 제외
      // raw
      const mRaw = measuredByKey.get(`${modelId}|${queryId}|raw`);
      const rawIn = mRaw ? mRaw.inputTokens : c.raw + overhead;
      const rawOut = mRaw ? mRaw.outputTokens : calibratedOutput;
      // artifact
      const mArt = measuredByKey.get(`${modelId}|${queryId}|artifact`);
      const artIn = mArt ? mArt.inputTokens : c.artifact + overhead;
      const artOut = mArt ? mArt.outputTokens : calibratedOutput;

      const rawTot = rawIn + rawOut;
      const artTot = artIn + artOut;
      rawInSum += rawIn; artInSum += artIn; rawTotSum += rawTot; artTotSum += artTot;
      if (hasPrice) {
        rawCost += rawIn / 1e6 * price.inputPerMtok + rawOut / 1e6 * price.outputPerMtok;
        artCost += artIn / 1e6 * price.inputPerMtok + artOut / 1e6 * price.outputPerMtok;
      }
      perQuery.push({
        queryId,
        rawInputTokens: rawIn, pwInputTokens: artIn,
        rawTotalTokens: rawTot, pwTotalTokens: artTot,
        source: (mRaw && mArt) ? "measured" : "predicted",
      });
    }

    const inRedux = rawInSum > 0 ? 1 - artInSum / rawInSum : null;
    const totRedux = rawTotSum > 0 ? 1 - artTotSum / rawTotSum : null;
    const costRedux = hasPrice && rawCost > 0 ? 1 - artCost / rawCost : null;
    const costBasis = hasPrice ? `${price.verified ? "verified" : "template"}:${price.inputPerMtok}/${price.outputPerMtok}` : "no_price";

    console.log([
      modelId, pct(inRedux), pct(totRedux), pct(costRedux), rawTotSum, artTotSum, costBasis,
    ].join("\t"));

    report.models.push({
      modelId, provider: price.provider,
      inputReductionEligible: inRedux, totalReductionEligible: totRedux, costReductionEligible: costRedux,
      rawInputTokens: rawInSum, pwInputTokens: artInSum,
      rawTotalTokens: rawTotSum, pwTotalTokens: artTotSum,
      rawCostUsd: hasPrice ? rawCost : null, pwCostUsd: hasPrice ? artCost : null,
      priceBasis: costBasis, perQuery,
    });
  }

  if (args.outDir) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(join(args.outDir, "predicted-live-from-offline.json"), JSON.stringify(report, null, 2), "utf8");
    console.log(`wrote ${join(args.outDir, "predicted-live-from-offline.json")}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
