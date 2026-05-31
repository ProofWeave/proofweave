// CLI:
//   tsx scripts/run-benchmark-v2.ts [--fixture=fixtures/benchmark-v2.sample.json]
//     [--top-k=3] [--iterations=1] [--out-dir=<dir>]
//
// Benchmark v2는 "얼마나 적은 context를 모델에 넣는가"만 계산한다.
// retrieval이 맞았는지, no-match를 잘 걸렀는지는 run-retrieval-benchmark.ts가
// 따로 평가한다. 이 분리를 유지해야 토큰 절감 수치가 품질 지표처럼 보이는
// 착시를 줄일 수 있다.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  countFixtureFiles,
  defaultFixturePath,
  fixtureRelativePath,
  getListingsOrThrow,
  judgmentMap,
  listingMap,
  loadBenchmarkFixture,
  mean,
  pct,
  topKFromFixture,
  type BenchmarkFixture,
  type BenchmarkListing,
  type ModelConfig,
  type QualityRubric,
  type TokenContext,
} from "./benchmark-v2-utils.js";

type ScenarioId = "raw" | "artifact" | "top_k";

interface Args {
  fixture: string;
  mode: "offline";
  topK: number | null;
  iterations: number;
  outDir: string | null;
}

interface QueryContexts {
  queryId: string;
  domain: string;
  expectedNoMatch: boolean;
  qualityRubric: QualityRubric | null;
  raw: TokenContext;
  artifact: TokenContext;
  top_k: TokenContext;
}

interface QualityProxy {
  score: number | null;
  pass: boolean | null;
  coverage: number | null;
  mustIncludeTotal: number;
  mustIncludeFound: number;
  mustNotHallucinateHits: string[];
  passThreshold: number | null;
}

interface ScenarioResult {
  benchmarkVersion: "v2";
  mode: "offline";
  iteration: number;
  modelId: string;
  provider: string;
  scenarioId: ScenarioId;
  queryId: string;
  domain: string;
  listingIds: string[];
  files: string[];
  inlineLabels: string[];
  contextTokensProxy: number;
  contextBytes: number;
  cttMethod: TokenContext["cttMethod"];
  reductionVsRaw: number | null;
  expectedNoMatch: boolean;
  qualityProxy: QualityProxy | null;
  qualityScore: number | null;
  qualityPass: boolean | null;
  qualityCoverage: number | null;
  fitsOfflineContextBudget: boolean;
  providerUsage: null;
  providerUsageMode: "future_live_mode_extension_only";
}

interface ModelSummary {
  modelId: string;
  provider: string;
  iterations: number;
  queries: number;
  scenarioTotals: Record<ScenarioId, { tokens: number; bytes: number }>;
  artifactReductionVsRaw: number | null;
  topKReductionVsRaw: number | null;
  meanArtifactReductionVsRaw: number | null;
  meanTopKReductionVsRaw: number | null;
  meanQualityScoreByScenario: Record<ScenarioId, number | null>;
  qualityPassRateByScenario: Record<ScenarioId, number | null>;
  overBudgetRecords: number;
}

interface DomainSummary {
  modelId: string;
  provider: string;
  domain: string;
  scenarioId: ScenarioId;
  queryCount: number;
  expectedNoMatchCount: number;
  totalContextTokensProxy: number;
  meanContextTokensProxy: number | null;
  meanReductionVsRaw: number | null;
  meanQualityScore: number | null;
  qualityPassRate: number | null;
  overBudgetRecords: number;
}

function parseArgs(argv: string[]): Args {
  let fixture = defaultFixturePath();
  let mode: Args["mode"] = "offline";
  let topK: number | null = null;
  let iterations = 1;
  let outDir: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith("--fixture=")) fixture = resolve(arg.slice("--fixture=".length));
    else if (arg.startsWith("--mode=")) {
      const rawMode = arg.slice("--mode=".length);
      if (rawMode !== "offline") {
        throw new Error("benchmark v2 currently supports --mode=offline only; provider usage is a future live-mode extension point.");
      }
      mode = rawMode;
    } else if (arg.startsWith("--top-k=")) {
      topK = Number(arg.slice("--top-k=".length));
    } else if (arg.startsWith("--iterations=")) {
      iterations = Number(arg.slice("--iterations=".length));
    } else if (arg.startsWith("--out-dir=")) {
      outDir = resolve(arg.slice("--out-dir=".length));
    }
  }

  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("--iterations must be a positive integer");
  }
  if (topK !== null && (!Number.isInteger(topK) || topK <= 0)) {
    throw new Error("--top-k must be a positive integer");
  }

  return { fixture, mode, topK, iterations, outDir };
}

function listingFiles(listings: BenchmarkListing[], mode: "raw" | "artifact"): string[] {
  if (mode === "raw") return listings.flatMap((listing) => listing.sourceBundle);
  return listings.map((listing) => listing.artifactPath);
}

function rawPromptInlineText(userQuery: string): { label: string; text: string } {
  return {
    label: "inline:raw-workflow-prompt",
    text: [
      "Workflow: raw",
      "User query:",
      userQuery,
      "Instruction: answer from the full raw source bundle and report missing evidence.",
      "Raw sources follow as file context.",
    ].join("\n"),
  };
}

function proofweavePromptInlineText(
  userQuery: string,
  mode: "artifact" | "top_k",
): { label: string; text: string } {
  return {
    label: `inline:proofweave-${mode}-prompt`,
    text: [
      `Workflow: proofweave_${mode}`,
      "User query:",
      userQuery,
      "Instruction: answer from the selected ProofWeave artifact context and report whether it is sufficient.",
      "Selected artifacts follow as file context.",
    ].join("\n"),
  };
}

function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function contextText(files: string[]): string {
  return files
    .map((file) => readFileSync(fixtureRelativePath(file), "utf8"))
    .join("\n");
}

function scoreQuality(
  rubric: QualityRubric | null,
  context: TokenContext,
  expectedNoMatch: boolean,
): QualityProxy | null {
  // Korean note: no-match query는 "검색하지 않음" 품질로 따로 봐야 하므로
  // 여기서는 artifact 내용 점수에 포함하지 않는다.
  if (!rubric || expectedNoMatch) return null;

  const text = contextText(context.files);
  const mustIncludeTotal = rubric.mustInclude.length;
  const mustIncludeFound = rubric.mustInclude.filter((term) => containsCI(text, term)).length;
  const mustNotHallucinateHits = rubric.mustNotHallucinate.filter((term) =>
    containsCI(text, term),
  );
  const coverage = mustIncludeTotal === 0 ? 1 : mustIncludeFound / mustIncludeTotal;
  const hallucinationPenalty = mustNotHallucinateHits.length === 0 ? 1 : 0;
  const score = coverage * hallucinationPenalty;

  return {
    score,
    pass: score >= rubric.passThreshold,
    coverage,
    mustIncludeTotal,
    mustIncludeFound,
    mustNotHallucinateHits,
    passThreshold: rubric.passThreshold,
  };
}

async function buildQueryContexts(
  fixture: BenchmarkFixture,
  topK: number,
): Promise<QueryContexts[]> {
  const byListingId = listingMap(fixture);
  const byJudgment = judgmentMap(fixture);
  const contexts: QueryContexts[] = [];

  for (const query of fixture.queries) {
    const judgment = byJudgment.get(query.queryId);
    const expectedIds = judgment?.relevantListingIds ?? query.expectedListingIds;
    const expectedNoMatch = judgment?.noMatchExpected ?? query.noMatchExpected ?? expectedIds.length === 0;
    const expectedListings = getListingsOrThrow(expectedIds, byListingId, query.queryId);
    const retrievedIds = topKFromFixture(query.queryId, topK, fixture);
    const retrievedListings = getListingsOrThrow(retrievedIds, byListingId, query.queryId);

    // raw/artifact는 정답 listing 기준의 "필요 컨텍스트" 크기이고,
    // top_k는 retrieval 결과를 그대로 넣었을 때의 "검색 컨텍스트" 크기다.
    // retrieval 정확도는 여기서 판단하지 않고 별도 스크립트가 계산한다.
    const raw = await countFixtureFiles(
      listingFiles(expectedListings, "raw"),
      expectedIds,
      [rawPromptInlineText(query.userQuery)],
    );
    const artifact = await countFixtureFiles(
      listingFiles(expectedListings, "artifact"),
      expectedIds,
      [proofweavePromptInlineText(query.userQuery, "artifact")],
    );
    const topKContext = await countFixtureFiles(
      listingFiles(retrievedListings, "artifact"),
      retrievedIds,
      [proofweavePromptInlineText(query.userQuery, "top_k")],
    );

    contexts.push({
      queryId: query.queryId,
      domain: query.domain,
      expectedNoMatch,
      qualityRubric: query.qualityRubric ?? null,
      raw,
      artifact,
      top_k: topKContext,
    });
  }

  return contexts;
}

function reductionVsRaw(
  rawTokens: number,
  scenarioTokens: number,
  scenarioId: ScenarioId,
  expectedNoMatch: boolean,
): number | null {
  // NO_MATCH query는 "검색이 없음을 맞혔는가"로 평가해야 하며,
  // 작은 context를 넣었다는 이유로 token saving 성공에 포함하지 않는다.
  if (expectedNoMatch || scenarioId === "raw" || rawTokens <= 0) return null;
  return 1 - scenarioTokens / rawTokens;
}

function meanQualityScore(results: ScenarioResult[], scenarioId: ScenarioId): number | null {
  return mean(
    results
      .filter((result) => result.scenarioId === scenarioId && result.qualityScore !== null)
      .map((result) => result.qualityScore as number),
  );
}

function qualityPassRate(results: ScenarioResult[], scenarioId: ScenarioId): number | null {
  const evaluated = results.filter(
    (result) => result.scenarioId === scenarioId && result.qualityPass !== null,
  );
  if (evaluated.length === 0) return null;
  return evaluated.filter((result) => result.qualityPass).length / evaluated.length;
}

function toScenarioResult(
  model: ModelConfig,
  context: QueryContexts,
  scenarioId: ScenarioId,
  iteration: number,
): ScenarioResult {
  const scenarioContext = context[scenarioId];
  const qualityProxy = scoreQuality(
    context.qualityRubric,
    scenarioContext,
    context.expectedNoMatch,
  );
  return {
    benchmarkVersion: "v2",
    mode: "offline",
    iteration,
    modelId: model.modelId,
    provider: model.provider,
    scenarioId,
    queryId: context.queryId,
    domain: context.domain,
    listingIds: scenarioContext.listingIds,
    files: scenarioContext.files,
    inlineLabels: scenarioContext.inlineLabels,
    contextTokensProxy: scenarioContext.ctt,
    contextBytes: scenarioContext.cb,
    cttMethod: scenarioContext.cttMethod,
    reductionVsRaw: reductionVsRaw(
      context.raw.ctt,
      scenarioContext.ctt,
      scenarioId,
      context.expectedNoMatch,
    ),
    expectedNoMatch: context.expectedNoMatch,
    qualityProxy,
    qualityScore: qualityProxy?.score ?? null,
    qualityPass: qualityProxy?.pass ?? null,
    qualityCoverage: qualityProxy?.coverage ?? null,
    fitsOfflineContextBudget: scenarioContext.ctt <= model.offlineContextBudgetTokens,
    providerUsage: null,
    providerUsageMode: "future_live_mode_extension_only",
  };
}

function summarizeModel(model: ModelConfig, results: ScenarioResult[]): ModelSummary {
  const scenarioTotals: ModelSummary["scenarioTotals"] = {
    raw: { tokens: 0, bytes: 0 },
    artifact: { tokens: 0, bytes: 0 },
    top_k: { tokens: 0, bytes: 0 },
  };

  for (const result of results) {
    scenarioTotals[result.scenarioId].tokens += result.contextTokensProxy;
    scenarioTotals[result.scenarioId].bytes += result.contextBytes;
  }

  const scoredResults = results.filter((result) => !result.expectedNoMatch);
  const rawTokens = scoredResults
    .filter((result) => result.scenarioId === "raw")
    .reduce((sum, result) => sum + result.contextTokensProxy, 0);
  const artifactTokens = scoredResults
    .filter((result) => result.scenarioId === "artifact")
    .reduce((sum, result) => sum + result.contextTokensProxy, 0);
  const topKTokens = scoredResults
    .filter((result) => result.scenarioId === "top_k")
    .reduce((sum, result) => sum + result.contextTokensProxy, 0);

  return {
    modelId: model.modelId,
    provider: model.provider,
    iterations: new Set(results.map((result) => result.iteration)).size,
    queries: new Set(results.map((result) => result.queryId)).size,
    scenarioTotals,
    artifactReductionVsRaw: rawTokens > 0 ? 1 - artifactTokens / rawTokens : null,
    topKReductionVsRaw: rawTokens > 0 ? 1 - topKTokens / rawTokens : null,
    meanArtifactReductionVsRaw: mean(
      results
        .filter((result) => result.scenarioId === "artifact" && result.reductionVsRaw !== null)
        .map((result) => result.reductionVsRaw as number),
    ),
    meanTopKReductionVsRaw: mean(
      results
        .filter((result) => result.scenarioId === "top_k" && result.reductionVsRaw !== null)
        .map((result) => result.reductionVsRaw as number),
    ),
    meanQualityScoreByScenario: {
      raw: meanQualityScore(results, "raw"),
      artifact: meanQualityScore(results, "artifact"),
      top_k: meanQualityScore(results, "top_k"),
    },
    qualityPassRateByScenario: {
      raw: qualityPassRate(results, "raw"),
      artifact: qualityPassRate(results, "artifact"),
      top_k: qualityPassRate(results, "top_k"),
    },
    overBudgetRecords: results.filter((result) => !result.fitsOfflineContextBudget).length,
  };
}

function summarizeDomains(model: ModelConfig, results: ScenarioResult[]): DomainSummary[] {
  const domains = [...new Set(results.map((result) => result.domain))].sort();
  const summaries: DomainSummary[] = [];

  for (const domain of domains) {
    for (const scenarioId of ["raw", "artifact", "top_k"] as const) {
      const rows = results.filter(
        (result) => result.domain === domain && result.scenarioId === scenarioId,
      );
      const reductions = rows
        .filter((result) => result.reductionVsRaw !== null)
        .map((result) => result.reductionVsRaw as number);
      const qualityScores = rows
        .filter((result) => result.qualityScore !== null)
        .map((result) => result.qualityScore as number);
      const qualityRows = rows.filter((result) => result.qualityPass !== null);
      summaries.push({
        modelId: model.modelId,
        provider: model.provider,
        domain,
        scenarioId,
        queryCount: new Set(rows.map((result) => result.queryId)).size,
        expectedNoMatchCount: new Set(
          rows.filter((result) => result.expectedNoMatch).map((result) => result.queryId),
        ).size,
        totalContextTokensProxy: rows.reduce((sum, result) => sum + result.contextTokensProxy, 0),
        meanContextTokensProxy: mean(rows.map((result) => result.contextTokensProxy)),
        meanReductionVsRaw: mean(reductions),
        meanQualityScore: mean(qualityScores),
        qualityPassRate:
          qualityRows.length === 0
            ? null
            : qualityRows.filter((result) => result.qualityPass).length / qualityRows.length,
        overBudgetRecords: rows.filter((result) => !result.fitsOfflineContextBudget).length,
      });
    }
  }

  return summaries;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n") + "\n";
}

function modelSummaryRows(summaries: ModelSummary[]): Array<Record<string, unknown>> {
  return summaries.map((summary) => ({
    modelId: summary.modelId,
    provider: summary.provider,
    rawTokens: summary.scenarioTotals.raw.tokens,
    artifactTokens: summary.scenarioTotals.artifact.tokens,
    topKTokens: summary.scenarioTotals.top_k.tokens,
    artifactReductionVsRaw: summary.artifactReductionVsRaw,
    topKReductionVsRaw: summary.topKReductionVsRaw,
    artifactQualityScore: summary.meanQualityScoreByScenario.artifact,
    topKQualityScore: summary.meanQualityScoreByScenario.top_k,
    artifactQualityPassRate: summary.qualityPassRateByScenario.artifact,
    topKQualityPassRate: summary.qualityPassRateByScenario.top_k,
    overBudgetRecords: summary.overBudgetRecords,
  }));
}

function domainSummaryRows(summaries: DomainSummary[]): Array<Record<string, unknown>> {
  return summaries.map((summary) => ({
    modelId: summary.modelId,
    provider: summary.provider,
    domain: summary.domain,
    scenarioId: summary.scenarioId,
    queryCount: summary.queryCount,
    expectedNoMatchCount: summary.expectedNoMatchCount,
    totalContextTokensProxy: summary.totalContextTokensProxy,
    meanContextTokensProxy: summary.meanContextTokensProxy,
    meanReductionVsRaw: summary.meanReductionVsRaw,
    meanQualityScore: summary.meanQualityScore,
    qualityPassRate: summary.qualityPassRate,
    overBudgetRecords: summary.overBudgetRecords,
  }));
}

function writeMarkdownSummary(
  outDir: string,
  summaries: ModelSummary[],
  domainSummaries: DomainSummary[],
  topK: number,
): void {
  const modelRows = summaries
    .map(
      (summary) =>
        `| ${summary.modelId} | ${summary.scenarioTotals.raw.tokens} | ${summary.scenarioTotals.artifact.tokens} | ${summary.scenarioTotals.top_k.tokens} | ${pct(summary.artifactReductionVsRaw)} | ${pct(summary.topKReductionVsRaw)} | ${pct(summary.qualityPassRateByScenario.artifact)} | ${pct(summary.qualityPassRateByScenario.top_k)} |`,
    )
    .join("\n");
  const domainRows = domainSummaries
    .filter((summary) => summary.scenarioId !== "raw")
    .map(
      (summary) =>
        `| ${summary.modelId} | ${summary.domain} | ${summary.scenarioId} | ${summary.queryCount} | ${pct(summary.meanReductionVsRaw)} | ${summary.meanQualityScore === null ? "n/a" : summary.meanQualityScore.toFixed(3)} | ${pct(summary.qualityPassRate)} | ${summary.totalContextTokensProxy} |`,
    )
    .join("\n");

  writeFileSync(
    join(outDir, "benchmark-v2-summary.md"),
    [
      "# Benchmark v2 Summary",
      "",
      `Top-K: ${topK}`,
      "",
      "## Model Summary",
      "",
      "| model | raw CTT | artifact CTT | top-k CTT | artifact reduction | top-k reduction | artifact quality pass | top-k quality pass |",
      "|---|---:|---:|---:|---:|---:|---:|---:|",
      modelRows,
      "",
      "## Domain Summary",
      "",
      "| model | domain | scenario | queries | mean reduction | mean quality score | quality pass | total CTT |",
      "|---|---|---|---:|---:|---:|---:|---:|",
      domainRows,
      "",
      "## Notes",
      "",
      "- CTT is an offline local context-token proxy, not provider billing usage.",
      "- Quality score is a deterministic rubric coverage proxy for visualization and regression checks.",
      "- Retrieval quality remains separate and is produced by `run-retrieval-benchmark.ts`.",
      "",
    ].join("\n"),
    "utf8",
  );
}

function printSummary(summaries: ModelSummary[], topK: number): void {
  console.log(`benchmark v2 offline token-context summary (topK=${topK})`);
  console.log(
    [
      "model",
      "raw_ctt",
      "artifact_ctt",
      "top_k_ctt",
      "artifact_reduction",
      "top_k_reduction",
      "artifact_quality_pass",
      "top_k_quality_pass",
      "over_budget",
    ].join("\t"),
  );
  for (const summary of summaries) {
    console.log(
      [
        summary.modelId,
        summary.scenarioTotals.raw.tokens,
        summary.scenarioTotals.artifact.tokens,
        summary.scenarioTotals.top_k.tokens,
        pct(summary.artifactReductionVsRaw),
        pct(summary.topKReductionVsRaw),
        pct(summary.qualityPassRateByScenario.artifact),
        pct(summary.qualityPassRateByScenario.top_k),
        summary.overBudgetRecords,
      ].join("\t"),
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = loadBenchmarkFixture(args.fixture);
  const topK = args.topK ?? fixture.scenarioConfig.defaultTopK;
  const queryContexts = await buildQueryContexts(fixture, topK);

  const results: ScenarioResult[] = [];
  for (let iteration = 1; iteration <= args.iterations; iteration++) {
    for (const model of fixture.modelConfig) {
      for (const context of queryContexts) {
        for (const scenarioId of ["raw", "artifact", "top_k"] as const) {
          results.push(toScenarioResult(model, context, scenarioId, iteration));
        }
      }
    }
  }

  const summaries = fixture.modelConfig.map((model) =>
    summarizeModel(
      model,
      results.filter((result) => result.modelId === model.modelId),
    ),
  );
  const domainSummaries = fixture.modelConfig.flatMap((model) =>
    summarizeDomains(
      model,
      results.filter((result) => result.modelId === model.modelId),
    ),
  );

  if (args.outDir) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(
      join(args.outDir, "benchmark-v2-results.jsonl"),
      results.map((result) => JSON.stringify(result)).join("\n") + "\n",
      "utf8",
    );
    writeFileSync(
      join(args.outDir, "benchmark-v2-summary.json"),
      JSON.stringify(
        {
          fixture: args.fixture,
          mode: args.mode,
          iterations: args.iterations,
          topK,
          providerUsage: "not_called",
          providerUsageMode: "future_live_mode_extension_only",
          summaries,
          domainSummaries,
          visualization: {
            modelSummaryCsv: "benchmark-v2-model-summary.csv",
            domainSummaryCsv: "benchmark-v2-domain-summary.csv",
            markdownSummary: "benchmark-v2-summary.md",
            recommendedChartKeys: [
              "artifactReductionVsRaw",
              "topKReductionVsRaw",
              "artifactQualityPassRate",
              "topKQualityPassRate",
              "meanQualityScore",
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      join(args.outDir, "benchmark-v2-model-summary.csv"),
      toCsv(modelSummaryRows(summaries)),
      "utf8",
    );
    writeFileSync(
      join(args.outDir, "benchmark-v2-domain-summary.csv"),
      toCsv(domainSummaryRows(domainSummaries)),
      "utf8",
    );
    writeMarkdownSummary(args.outDir, summaries, domainSummaries, topK);
  }

  printSummary(summaries, topK);
  if (args.outDir) console.log(`wrote benchmark v2 outputs to ${args.outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
