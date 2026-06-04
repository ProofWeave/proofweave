// CLI: node scripts/summarize-live-results.mjs <results.jsonl> [<results2.jsonl> ...]
//
// live runner 산출물(live-results.jsonl)을 모델별로 집계한다.
// raw vs artifact의 input/output/total/cost 절감을 paired로 계산.
// no-match(bq_full_037)와 에러 행은 절감 집계에서 제외(단, 별도로 카운트).
// 모든 수치는 provider usage metadata 기반 실측 + estimatedCost.

import { readFileSync } from "node:fs";

const NO_MATCH = new Set(["bq_full_037"]);
const files = process.argv.slice(2);
if (files.length === 0) { console.error("usage: node summarize-live-results.mjs <jsonl>..."); process.exit(2); }

const rows = [];
for (const f of files) {
  for (const line of readFileSync(f, "utf8").trim().split("\n")) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
}

// model → query → {raw, artifact}
const byModel = new Map();
for (const r of rows) {
  if (r.error) continue;
  if (!byModel.has(r.modelId)) byModel.set(r.modelId, new Map());
  const q = byModel.get(r.modelId);
  if (!q.has(r.queryId)) q.set(r.queryId, {});
  q.get(r.queryId)[r.scenarioId] = r;
}

function pct(n) { return n == null || !Number.isFinite(n) ? "n/a" : (n * 100).toFixed(2) + "%"; }

const summary = [];
for (const [modelId, q] of byModel) {
  let rawIn = 0, artIn = 0, rawOut = 0, artOut = 0, rawTot = 0, artTot = 0, rawCost = 0, artCost = 0;
  let pairedEligible = 0, costAvail = true;
  for (const [queryId, pair] of q) {
    if (NO_MATCH.has(queryId)) continue;
    if (!pair.raw || !pair.artifact) continue; // paired만
    pairedEligible++;
    rawIn += pair.raw.inputTokens; artIn += pair.artifact.inputTokens;
    rawOut += pair.raw.outputTokens; artOut += pair.artifact.outputTokens;
    rawTot += pair.raw.totalTokens; artTot += pair.artifact.totalTokens;
    if (pair.raw.estimatedCostUsd == null || pair.artifact.estimatedCostUsd == null) costAvail = false;
    else { rawCost += pair.raw.estimatedCostUsd; artCost += pair.artifact.estimatedCostUsd; }
  }
  summary.push({
    modelId, pairedEligibleQueries: pairedEligible,
    rawInputTokens: rawIn, artifactInputTokens: artIn, inputReduction: rawIn > 0 ? 1 - artIn / rawIn : null,
    rawOutputTokens: rawOut, artifactOutputTokens: artOut,
    rawTotalTokens: rawTot, artifactTotalTokens: artTot, totalReduction: rawTot > 0 ? 1 - artTot / rawTot : null,
    // 비용은 "절감률(상대값)"만 노출한다. 절대 금액(달러)은 의도적으로 기재하지 않는다.
    costReduction: costAvail && rawCost > 0 ? 1 - artCost / rawCost : null,
  });
}

console.log("=== LIVE 실측 집계 (provider usage; no-match·에러 제외, paired) ===");
console.log("usageSource=provider_usage_metadata; cost=estimatedCost(verified price); single-shot(no cache/tool)");
console.log("model\tpairs\tin_redux\ttotal_redux\tcost_redux\trawTot→pwTot");
for (const s of summary) {
  console.log([
    s.modelId, s.pairedEligibleQueries, pct(s.inputReduction), pct(s.totalReduction), pct(s.costReduction),
    `${s.rawTotalTokens}→${s.artifactTotalTokens}`,
  ].join("\t"));
}

console.log("\n=== JSON ===");
console.log(JSON.stringify(summary, null, 2));
