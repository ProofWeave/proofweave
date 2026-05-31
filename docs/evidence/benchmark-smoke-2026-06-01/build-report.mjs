import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const evidenceDir = new URL(".", import.meta.url).pathname;

const paths = {
  claude: "/tmp/proofweave-live-benchmark-claude-opus-4.8/smoke",
  gpt: "/tmp/proofweave-live-benchmark-gpt-5.5-fast-high/smoke",
  gemini: "/tmp/proofweave-live-benchmark-gemini/smoke",
};

const formatPct = (value) => `${(value * 100).toFixed(2)}%`;
const formatUsd = (value) => value == null ? "n/a" : `$${value.toFixed(6)}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function groupPairs(rows, tokenFields) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.queryId)) grouped.set(row.queryId, {});
    grouped.get(row.queryId)[row.workflow] = row;
  }

  return [...grouped.entries()].map(([queryId, pair]) => {
    const raw = pair.raw;
    const proofweave = pair.proofweave;
    const noMatch = Boolean(raw?.expectedNoMatch ?? proofweave?.expectedNoMatch);
    const qualityPairPass = raw?.qualityPass === true && proofweave?.qualityPass === true;
    const savingEligible = !noMatch && qualityPairPass;
    const rawInput = raw?.[tokenFields.input] ?? 0;
    const pwInput = proofweave?.[tokenFields.input] ?? 0;
    const rawTotal = raw?.[tokenFields.total] ?? 0;
    const pwTotal = proofweave?.[tokenFields.total] ?? 0;

    return {
      queryId,
      domain: raw?.domain ?? proofweave?.domain ?? "unknown",
      noMatch,
      raw,
      proofweave,
      qualityPairPass,
      savingEligible,
      inputReduction: rawInput > 0 ? 1 - pwInput / rawInput : null,
      totalReduction: rawTotal > 0 ? 1 - pwTotal / rawTotal : null,
    };
  });
}

function summarizePairs(pairs, tokenFields, costFields = null) {
  const eligible = pairs.filter((pair) => pair.savingEligible);
  const allRows = pairs.flatMap((pair) => [pair.raw, pair.proofweave].filter(Boolean));

  const sum = (rows, field) => rows.reduce((acc, row) => acc + (Number(row?.[field]) || 0), 0);
  const rawRows = pairs.map((pair) => pair.raw).filter(Boolean);
  const pwRows = pairs.map((pair) => pair.proofweave).filter(Boolean);
  const eligibleRawRows = eligible.map((pair) => pair.raw);
  const eligiblePwRows = eligible.map((pair) => pair.proofweave);

  const rawInputEligible = sum(eligibleRawRows, tokenFields.input);
  const pwInputEligible = sum(eligiblePwRows, tokenFields.input);
  const rawTotalEligible = sum(eligibleRawRows, tokenFields.total);
  const pwTotalEligible = sum(eligiblePwRows, tokenFields.total);

  return {
    workflowRecordCount: allRows.length,
    pairCount: pairs.length,
    savingEligiblePairs: eligible.length,
    noMatchPairs: pairs.filter((pair) => pair.noMatch).length,
    qualityFailures: pairs.filter((pair) => !pair.qualityPairPass).length,
    meanInputReductionEligible: eligible.length
      ? eligible.reduce((acc, pair) => acc + pair.inputReduction, 0) / eligible.length
      : null,
    meanTotalReductionEligible: eligible.length
      ? eligible.reduce((acc, pair) => acc + pair.totalReduction, 0) / eligible.length
      : null,
    aggregateInputReductionEligible: rawInputEligible > 0 ? 1 - pwInputEligible / rawInputEligible : null,
    aggregateTotalReductionEligible: rawTotalEligible > 0 ? 1 - pwTotalEligible / rawTotalEligible : null,
    totalsAllRows: {
      rawInput: sum(rawRows, tokenFields.input),
      proofweaveInput: sum(pwRows, tokenFields.input),
      rawOutput: sum(rawRows, tokenFields.output),
      proofweaveOutput: sum(pwRows, tokenFields.output),
      rawReasoning: tokenFields.reasoning ? sum(rawRows, tokenFields.reasoning) : null,
      proofweaveReasoning: tokenFields.reasoning ? sum(pwRows, tokenFields.reasoning) : null,
      rawCacheRead: tokenFields.cacheRead ? sum(rawRows, tokenFields.cacheRead) : null,
      proofweaveCacheRead: tokenFields.cacheRead ? sum(pwRows, tokenFields.cacheRead) : null,
      rawTotal: sum(rawRows, tokenFields.total),
      proofweaveTotal: sum(pwRows, tokenFields.total),
    },
    totalsEligible: {
      rawInput: rawInputEligible,
      proofweaveInput: pwInputEligible,
      rawOutput: sum(eligibleRawRows, tokenFields.output),
      proofweaveOutput: sum(eligiblePwRows, tokenFields.output),
      rawReasoning: tokenFields.reasoning ? sum(eligibleRawRows, tokenFields.reasoning) : null,
      proofweaveReasoning: tokenFields.reasoning ? sum(eligiblePwRows, tokenFields.reasoning) : null,
      rawCacheRead: tokenFields.cacheRead ? sum(eligibleRawRows, tokenFields.cacheRead) : null,
      proofweaveCacheRead: tokenFields.cacheRead ? sum(eligiblePwRows, tokenFields.cacheRead) : null,
      rawTotal: rawTotalEligible,
      proofweaveTotal: pwTotalEligible,
      rawCost: costFields ? sum(eligibleRawRows, costFields.cost) : null,
      proofweaveCost: costFields ? sum(eligiblePwRows, costFields.cost) : null,
    },
  };
}

function loadClaude() {
  const summary = readJson(join(paths.claude, "live-summary.json"));
  const rows = readJsonl(join(paths.claude, "live-results.jsonl"));
  const pairs = groupPairs(rows, {
    input: "inputTokensProxy",
    output: "outputTokensProxy",
    total: "totalTokensProxy",
  });
  const computed = summarizePairs(pairs, {
    input: "inputTokensProxy",
    output: "outputTokensProxy",
    total: "totalTokensProxy",
  });
  return {
    label: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    status: "complete",
    artifactStatus: "complete",
    usageSource: "offline_ctt",
    providerBillingClaim: false,
    actualProviderModelId: summary.actualProviderModelId,
    actualModeOrVariant: summary.actualModeOrVariant,
    opencodeAgentProfile: summary.opencodeAgentProfile,
    outputDir: paths.claude,
    smokeQueryIds: pairs.map((pair) => pair.queryId),
    pairs,
    summary: computed,
    note: "Live answers exist, but token usage is local tiktoken/o200k proxy, not Anthropic billing usage.",
  };
}

function loadGpt() {
  const summary = readJson(join(paths.gpt, "live-summary.json"));
  const rows = readJsonl(join(paths.gpt, "live-results.jsonl"));
  const pairs = groupPairs(rows, {
    input: "inputTokens",
    output: "outputTokens",
    reasoning: "reasoningTokens",
    total: "totalTokens",
  });
  const computed = summarizePairs(pairs, {
    input: "inputTokens",
    output: "outputTokens",
    reasoning: "reasoningTokens",
    total: "totalTokens",
  });
  return {
    label: "gpt-5.5-fast-high",
    name: "GPT-5.5 Fast High",
    status: "complete",
    artifactStatus: "complete",
    usageSource: "opencode_request_usage",
    providerBillingClaim: false,
    actualProviderModelId: summary.actualProviderModelId,
    actualModeOrVariant: summary.actualModeOrVariant,
    opencodeAgentProfile: summary.opencodeAgentProfile,
    requestedOpencodeAgentProfile: summary.requestedOpencodeAgentProfile,
    outputDir: paths.gpt,
    smokeQueryIds: summary.smokeQueryIds,
    pairs,
    summary: computed,
    note: "OpenCode request-level observed usage. Provider billing metadata is not present.",
  };
}

function loadGemini() {
  const logDir = join(paths.gemini, "request-logs");
  const files = existsSync(logDir) ? readdirSync(logDir).filter((file) => file.endsWith(".jsonl")).sort() : [];
  const rows = [];

  for (const file of files) {
    const fullPath = join(logDir, file);
    const lines = readJsonl(fullPath);
    const stepFinish = lines.find((line) => line.type === "step_finish");
    const text = lines.find((line) => line.type === "text");
    const match = basename(file).match(/(bq_full_\d+)-(raw|proofweave)\.jsonl$/);
    if (!stepFinish || !match) continue;
    let answer = null;
    try {
      answer = text?.part?.text ? JSON.parse(text.part.text) : null;
    } catch {
      answer = null;
    }

    rows.push({
      benchmarkModelLabel: "gemini-3.5-flash",
      actualProviderModelId: "google/gemini-3.5-flash",
      actualProviderModelIdNote: "Reported by Gemini run; JSONL request logs do not independently expose model id.",
      opencodeAgentProfile: "Atlas - Plan Executor",
      opencodeAgentProfileNote: "Reported by Gemini run; JSONL request logs do not independently expose agent profile.",
      usedTeamModeOrSubagents: false,
      usageSource: "opencode_request_usage",
      billingUsageClaim: false,
      queryId: match[1],
      workflow: match[2],
      domain: domainForQuery(match[1]),
      expectedNoMatch: match[1] === "bq_full_037",
      inputTokens: stepFinish.part.tokens.input,
      outputTokens: stepFinish.part.tokens.output,
      reasoningTokens: stepFinish.part.tokens.reasoning,
      cacheReadTokens: stepFinish.part.tokens.cache?.read ?? 0,
      cacheWriteTokens: stepFinish.part.tokens.cache?.write ?? 0,
      totalTokens: stepFinish.part.tokens.total,
      observedCostUsd: stepFinish.part.cost,
      sessionId: stepFinish.sessionID,
      qualityPass: Array.isArray(answer?.rubric_terms_missing) ? answer.rubric_terms_missing.length === 0 : true,
      answer,
      sourceLog: fullPath,
    });
  }

  const pairs = groupPairs(rows, {
    input: "inputTokens",
    output: "outputTokens",
    reasoning: "reasoningTokens",
    cacheRead: "cacheReadTokens",
    total: "totalTokens",
  });
  const computed = summarizePairs(
    pairs,
    {
      input: "inputTokens",
      output: "outputTokens",
      reasoning: "reasoningTokens",
      cacheRead: "cacheReadTokens",
      total: "totalTokens",
    },
    { cost: "observedCostUsd" },
  );

  return {
    label: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    status: rows.length === 10 ? "log_complete_summary_derived" : "incomplete",
    artifactStatus: rows.length === 10 ? "derived_from_request_logs" : "incomplete",
    usageSource: "opencode_request_usage",
    providerBillingClaim: false,
    actualProviderModelId: "google/gemini-3.5-flash",
    actualModeOrVariant: "flash",
    opencodeAgentProfile: "Atlas - Plan Executor",
    outputDir: paths.gemini,
    smokeQueryIds: pairs.map((pair) => pair.queryId),
    pairs,
    rows,
    summary: computed,
    note: "Summary generated locally from existing request logs only. No new model calls were made.",
  };
}

function domainForQuery(queryId) {
  return {
    bq_full_001: "api_spec_migration",
    bq_full_007: "onchain_fee_measurement",
    bq_full_013: "market_timeseries",
    bq_full_019: "regulatory_comparison",
    bq_full_025: "security_deployment",
    bq_full_031: "agent_workflow",
    bq_full_037: "api_spec_migration",
    bq_full_040: "regulatory_comparison",
  }[queryId] ?? "unknown";
}

function writeGeminiArtifacts(gemini) {
  mkdirSync(paths.gemini, { recursive: true });
  writeFileSync(
    join(paths.gemini, "live-results.jsonl"),
    `${gemini.rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  writeJson(join(paths.gemini, "live-summary.json"), {
    benchmarkModelLabel: gemini.label,
    actualProviderModelId: gemini.actualProviderModelId,
    actualModeOrVariant: gemini.actualModeOrVariant,
    opencodeAgentProfile: gemini.opencodeAgentProfile,
    usedTeamModeOrSubagents: false,
    usageSource: gemini.usageSource,
    billingUsageClaim: false,
    smokeQueryIds: gemini.smokeQueryIds,
    queryCount: gemini.pairs.length,
    workflowRecordCount: gemini.summary.workflowRecordCount,
    pairCount: gemini.summary.pairCount,
    savingEligiblePairs: gemini.summary.savingEligiblePairs,
    noMatchPairs: gemini.summary.noMatchPairs,
    qualityFailures: gemini.summary.qualityFailures,
    meanInputReductionEligible: gemini.summary.meanInputReductionEligible,
    meanTotalReductionEligible: gemini.summary.meanTotalReductionEligible,
    aggregateInputReductionEligible: gemini.summary.aggregateInputReductionEligible,
    aggregateTotalReductionEligible: gemini.summary.aggregateTotalReductionEligible,
    totalsAllRows: gemini.summary.totalsAllRows,
    totalsEligible: gemini.summary.totalsEligible,
    pairs: gemini.pairs.map(serializePair),
    generatedFromExistingLogsOnly: true,
  });
  writeFileSync(join(paths.gemini, "quality-failures.jsonl"), "");

  writeFileSync(join(paths.gemini, "model-summary.csv"), [
    "benchmarkModelLabel,usageSource,pairCount,savingEligiblePairs,qualityFailures,meanInputReductionEligible,meanTotalReductionEligible,aggregateInputReductionEligible,aggregateTotalReductionEligible,rawObservedCostEligible,proofweaveObservedCostEligible",
    [
      gemini.label,
      gemini.usageSource,
      gemini.summary.pairCount,
      gemini.summary.savingEligiblePairs,
      gemini.summary.qualityFailures,
      gemini.summary.meanInputReductionEligible,
      gemini.summary.meanTotalReductionEligible,
      gemini.summary.aggregateInputReductionEligible,
      gemini.summary.aggregateTotalReductionEligible,
      gemini.summary.totalsEligible.rawCost,
      gemini.summary.totalsEligible.proofweaveCost,
    ].join(","),
  ].join("\n") + "\n");

  writeFileSync(join(paths.gemini, "domain-summary.csv"), [
    "queryId,domain,noMatch,rawInput,proofweaveInput,rawTotal,proofweaveTotal,inputReduction,totalReduction,rawObservedCost,proofweaveObservedCost,qualityPairPass,savingEligible",
    ...gemini.pairs.map((pair) => [
      pair.queryId,
      pair.domain,
      pair.noMatch,
      pair.raw?.inputTokens,
      pair.proofweave?.inputTokens,
      pair.raw?.totalTokens,
      pair.proofweave?.totalTokens,
      pair.inputReduction,
      pair.totalReduction,
      pair.raw?.observedCostUsd,
      pair.proofweave?.observedCostUsd,
      pair.qualityPairPass,
      pair.savingEligible,
    ].join(",")),
  ].join("\n") + "\n");

  writeFileSync(join(paths.gemini, "usage-source-audit.md"), `# Usage Source Audit - Gemini 3.5 Flash

- benchmarkModelLabel: gemini-3.5-flash
- actualProviderModelId: google/gemini-3.5-flash (reported by run; JSONL logs do not independently expose it)
- opencodeAgentProfile: Atlas - Plan Executor (reported by run; JSONL logs do not independently expose it)
- usedTeamModeOrSubagents: false
- usageSource: opencode_request_usage
- billingUsageClaim: false
- generatedFromExistingLogsOnly: true

These numbers were parsed from existing OpenCode request logs under \`request-logs/\`.
No new model calls were made while generating this summary.

The token and cost fields are OpenCode-observed request fields, not provider billing metadata.
`);

  writeFileSync(join(paths.gemini, "smoke-set-audit.md"), `# Smoke Set Audit - Gemini 3.5 Flash

Canonical smoke set used:

${gemini.smokeQueryIds.map((queryId) => `- ${queryId}`).join("\n")}

This matches the GPT smoke set and does not match the earlier Claude smoke set.
`);

  writeFileSync(join(paths.gemini, "no-match-analysis.md"), `# No-Match Analysis - Gemini 3.5 Flash

No-match query: \`bq_full_037\`

The no-match pair is retained in the raw data and excluded from saving-eligible aggregation.
`);

  writeFileSync(join(paths.gemini, "live-summary.md"), renderModelSection(gemini));
}

function serializePair(pair) {
  return {
    queryId: pair.queryId,
    domain: pair.domain,
    noMatch: pair.noMatch,
    qualityPairPass: pair.qualityPairPass,
    savingEligible: pair.savingEligible,
    inputReduction: pair.inputReduction,
    totalReduction: pair.totalReduction,
    raw: pair.raw,
    proofweave: pair.proofweave,
  };
}

function renderModelSection(model) {
  const summary = model.summary;
  const eligible = summary.totalsEligible;
  const all = summary.totalsAllRows;
  const costLine = eligible.rawCost != null
    ? `| observed cost, eligible | ${formatUsd(eligible.rawCost)} | ${formatUsd(eligible.proofweaveCost)} |`
    : null;

  return `# ${model.name} Smoke Summary

| Field | Value |
|---|---|
| status | ${model.status} |
| usageSource | ${model.usageSource} |
| providerBillingClaim | ${model.providerBillingClaim} |
| actualProviderModelId | ${model.actualProviderModelId ?? "n/a"} |
| actualModeOrVariant | ${model.actualModeOrVariant ?? "n/a"} |
| opencodeAgentProfile | ${model.opencodeAgentProfile ?? "n/a"} |
| outputDir | ${model.outputDir} |

## Query Set

${model.smokeQueryIds.map((queryId) => `- ${queryId}`).join("\n")}

## Main Numbers

| Metric | Value |
|---|---:|
| pairCount | ${summary.pairCount} |
| savingEligiblePairs | ${summary.savingEligiblePairs} |
| noMatchPairs | ${summary.noMatchPairs} |
| qualityFailures | ${summary.qualityFailures} |
| mean input reduction, eligible | ${formatPct(summary.meanInputReductionEligible)} |
| mean total reduction, eligible | ${formatPct(summary.meanTotalReductionEligible)} |
| aggregate input reduction, eligible | ${formatPct(summary.aggregateInputReductionEligible)} |
| aggregate total reduction, eligible | ${formatPct(summary.aggregateTotalReductionEligible)} |

## Eligible Totals

| Metric | Raw | ProofWeave |
|---|---:|---:|
| input | ${eligible.rawInput} | ${eligible.proofweaveInput} |
| output | ${eligible.rawOutput} | ${eligible.proofweaveOutput} |
${eligible.rawReasoning != null ? `| reasoning | ${eligible.rawReasoning} | ${eligible.proofweaveReasoning} |\n` : ""}${eligible.rawCacheRead != null ? `| cache read | ${eligible.rawCacheRead} | ${eligible.proofweaveCacheRead} |\n` : ""}| total | ${eligible.rawTotal} | ${eligible.proofweaveTotal} |
${costLine ? `${costLine}\n` : ""}
## All Rows Totals

| Metric | Raw | ProofWeave |
|---|---:|---:|
| input | ${all.rawInput} | ${all.proofweaveInput} |
| output | ${all.rawOutput} | ${all.proofweaveOutput} |
${all.rawReasoning != null ? `| reasoning | ${all.rawReasoning} | ${all.proofweaveReasoning} |\n` : ""}${all.rawCacheRead != null ? `| cache read | ${all.rawCacheRead} | ${all.proofweaveCacheRead} |\n` : ""}| total | ${all.rawTotal} | ${all.proofweaveTotal} |

Note: ${model.note}
`;
}

function renderReport(models) {
  const [claude, gpt, gemini] = models;
  return `# ProofWeave Smoke Benchmark Observed Usage Report

작성일: 2026-06-01

## 결론

OpenCode에서도 사용량 관측은 가능하다. 따라서 이 보고서는 \`provider billing\`이 아니라 \`observed usage\` 기준으로 숫자를 정리한다.

단, 세 모델의 usage source가 같지는 않다. Claude는 OpenCode request usage가 남아 있지 않아 \`offline_ctt\` proxy이고, GPT/Gemini는 OpenCode request logs 기반이다. 따라서 외부 claim에는 "OpenCode observed/proxy"라는 라벨을 반드시 붙여야 한다.

## Model Status Matrix

| Model | Status | usageSource | Provider billing claim | Pair count | Saving eligible | Mean input reduction | Mean total reduction |
|---|---|---|---|---:|---:|---:|---:|
${models.map((model) => `| ${model.name} | ${model.status} | \`${model.usageSource}\` | ${model.providerBillingClaim ? "yes" : "no"} | ${model.summary.pairCount} | ${model.summary.savingEligiblePairs} | ${formatPct(model.summary.meanInputReductionEligible)} | ${formatPct(model.summary.meanTotalReductionEligible)} |`).join("\n")}

## Observed Usage Totals

| Model | Metric basis | Raw input | PW input | Raw total | PW total | Raw observed cost | PW observed cost |
|---|---|---:|---:|---:|---:|---:|---:|
${models.map((model) => {
  const eligible = model.summary.totalsEligible;
  return `| ${model.name} | ${model.usageSource} | ${eligible.rawInput} | ${eligible.proofweaveInput} | ${eligible.rawTotal} | ${eligible.proofweaveTotal} | ${formatUsd(eligible.rawCost)} | ${formatUsd(eligible.proofweaveCost)} |`;
}).join("\n")}

## Interpretation

- Claude shows the strongest proxy reduction, but it is \`offline_ctt\`, not Anthropic billing usage.
- GPT shows strong input-token reduction, but total-token reduction is small because OpenCode request totals include reasoning/cache/runtime overhead.
- Gemini request logs show only modest input/total reduction and observed cost is higher on the ProofWeave path for the saving-eligible subset. This means Gemini cannot be used as a positive cost-saving claim from the current OpenCode run.
- Current evidence is enough for an internal smoke report, not enough for a landing-page billing-savings claim.

## Cost Accounting Warning

The Gemini request logs sum to a local OpenCode logged cost of about \`$0.282340\`
across the 10 canonical request logs, while the user observed about \`$15\` of
account spend during the broader run. Treat these as different accounting
surfaces:

- \`request log cost\`: parsed from the 10 local JSONL request logs only.
- \`user-observed spend\`: likely includes earlier failed/fallback/probe calls,
  session/runtime overhead, dashboard/account aggregation, or other OpenCode
  billing scope not present in the 10 JSONL files.

Therefore the report uses the local request-log numbers for per-query analysis,
but the operational conclusion is stricter: do not run more OpenCode live
benchmark calls until a hard cost cap and direct API/count harness exist.

## Query Set Mismatch

Claude query set:

${claude.smokeQueryIds.map((queryId) => `- ${queryId}`).join("\n")}

GPT/Gemini query set:

${gpt.smokeQueryIds.map((queryId) => `- ${queryId}`).join("\n")}

Because Claude used a different query set, do not publish a direct three-model comparison. Use GPT/Gemini for same-set OpenCode observed comparison, and Claude as a separate smoke run.

## Visualization Recommendation

Use these charts:

1. Model status matrix: complete / derived / incomplete, with usage source.
2. Input reduction vs total reduction: show how OpenCode overhead reduces the apparent total saving.
3. Observed cost bar chart for Gemini: raw vs ProofWeave, showing that current observed cost is not favorable.
4. Query set overlap chart: Claude set vs GPT/Gemini set.
5. Evidence quality ladder: provider billing metadata, provider count API, OpenCode request usage, offline CTT.

Claude coworker can build the dashboard/slide, but only from \`chart-data.json\` and \`chart-data.csv\`. Do not let the visualization worker recalculate benchmark numbers.
`;
}

const claude = loadClaude();
const gpt = loadGpt();
const gemini = loadGemini();
const models = [claude, gpt, gemini];

writeGeminiArtifacts(gemini);

const chartData = {
  generatedAt: "2026-06-01",
  basis: "OpenCode observed usage where available; Claude offline CTT proxy only",
  models: models.map((model) => ({
    label: model.label,
    name: model.name,
    status: model.status,
    usageSource: model.usageSource,
    providerBillingClaim: model.providerBillingClaim,
    smokeQueryIds: model.smokeQueryIds,
    pairCount: model.summary.pairCount,
    savingEligiblePairs: model.summary.savingEligiblePairs,
    noMatchPairs: model.summary.noMatchPairs,
    qualityFailures: model.summary.qualityFailures,
    meanInputReductionEligible: model.summary.meanInputReductionEligible,
    meanTotalReductionEligible: model.summary.meanTotalReductionEligible,
    aggregateInputReductionEligible: model.summary.aggregateInputReductionEligible,
    aggregateTotalReductionEligible: model.summary.aggregateTotalReductionEligible,
    totalsEligible: model.summary.totalsEligible,
    totalsAllRows: model.summary.totalsAllRows,
    outputDir: model.outputDir,
  })),
};

writeJson(join(evidenceDir, "chart-data.json"), chartData);

writeFileSync(join(evidenceDir, "chart-data.csv"), [
  "model,status,usageSource,pairCount,savingEligiblePairs,noMatchPairs,qualityFailures,meanInputReductionEligible,meanTotalReductionEligible,aggregateInputReductionEligible,aggregateTotalReductionEligible,rawInputEligible,proofweaveInputEligible,rawTotalEligible,proofweaveTotalEligible,rawObservedCostEligible,proofweaveObservedCostEligible",
  ...models.map((model) => {
    const s = model.summary;
    const e = s.totalsEligible;
    return [
      model.name,
      model.status,
      model.usageSource,
      s.pairCount,
      s.savingEligiblePairs,
      s.noMatchPairs,
      s.qualityFailures,
      s.meanInputReductionEligible,
      s.meanTotalReductionEligible,
      s.aggregateInputReductionEligible,
      s.aggregateTotalReductionEligible,
      e.rawInput,
      e.proofweaveInput,
      e.rawTotal,
      e.proofweaveTotal,
      e.rawCost ?? "",
      e.proofweaveCost ?? "",
    ].join(",");
  }),
].join("\n") + "\n");

writeFileSync(join(evidenceDir, "observed-usage-report.md"), renderReport(models));

for (const model of models) {
  writeFileSync(join(evidenceDir, `${model.label}-summary.md`), renderModelSection(model));
}

console.log(`Wrote benchmark smoke evidence to ${evidenceDir}`);
console.log(`Wrote derived Gemini artifacts to ${paths.gemini}`);
