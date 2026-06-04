// CLI:
//   # DRY-RUN (기본): API 호출 0. offline 입력 토큰/예상 비용만 계산·출력.
//   tsx scripts/run-live-model-benchmark.ts \
//     --fixture=fixtures/benchmark-v2.full.json \
//     --pricing=fixtures/provider-pricing.current.json \
//     --queries=canonical5 --scenarios=raw,artifact --max-output-tokens=600
//
//   # 실제 실행: 아래가 모두 충족돼야만 호출한다.
//   #   1) --execute 플래그
//   #   2) 모델의 apiKeyEnv 키가 환경에 존재
//   #   3) --max-usd=<cap> 지정 + 사전 projection 합계 <= cap
//   #   4) providerModelId + 단가가 pricing config에 채워짐
//   tsx scripts/run-live-model-benchmark.ts ... --execute --max-usd=0.50
//
// 설계 원칙(직전 진단 반영):
//   - single-shot. agent 루프/도구/멀티스텝 없음.
//   - cache/web search/grounding/file search OFF (REST 기본).
//   - concurrency=1 (병렬 호출 없음).
//   - provider usage metadata 원본(providerUsageRaw)을 그대로 보존.
//   - 비용은 provider usage × pricing 으로 계산하되 estimated 라벨. 단가 미검증이면 cost=null.
//   - 자동 재시도 없음(비용 폭주 방지). 실패는 row로 기록.
//
// ⚠️ run day 검증 필수: 각 provider의 endpoint, providerModelId, usage 필드명, 단가는
//   바뀔 수 있다. 아래 어댑터는 문서화된 형태 기준이며 raw usage를 항상 저장하므로
//   필드명이 달라도 사후 재계산 가능하다.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { countText } from "./count-canonical.js";
import {
  loadBenchmarkFixture,
  listingMap,
  judgmentMap,
  getListingsOrThrow,
  fixtureRelativePath,
  type BenchmarkFixture,
  type BenchmarkListing,
} from "./benchmark-v2-utils.js";

// 의존성 없는 .env 로더: experiments/token-efficiency/.env 의 KEY=VALUE 를 process.env 로 읽는다.
// 이미 셸에 설정된 값은 덮어쓰지 않는다. (.env 는 .gitignore 로 커밋 제외됨)
function loadDotEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv();

type Scenario = "raw" | "artifact";

const SYSTEM_PROMPT = [
  "You are a benchmark answerer. Answer ONLY from the provided context.",
  "Return strict JSON with this schema and nothing else:",
  '{"answer":"string","used_listing_ids":["string"],"missing_evidence":["string"],',
  '"confidence":"low|medium|high","rubric_terms_covered":["string"],"rubric_terms_missing":["string"]}',
  "If the context is insufficient, say so in missing_evidence and do not invent facts.",
].join("\n");

const CANONICAL5 = ["bq_full_013", "bq_full_019", "bq_full_025", "bq_full_031", "bq_full_037"];

interface Args {
  fixture: string;
  pricing: string;
  models: string[] | null;
  scenarios: Scenario[];
  queries: "canonical5" | "all" | string[];
  maxOutputTokens: number;
  maxUsd: number | null;
  execute: boolean;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  let fixture = resolve("fixtures/benchmark-v2.full.json");
  let pricing = resolve("fixtures/provider-pricing.current.json");
  let models: string[] | null = null;
  let scenarios: Scenario[] = ["raw", "artifact"];
  let queries: Args["queries"] = "canonical5";
  let maxOutputTokens = 600;
  let maxUsd: number | null = null;
  let execute = false;
  let outDir = resolve("/tmp/proofweave-live-benchmark");
  for (const a of argv) {
    if (a.startsWith("--fixture=")) fixture = resolve(a.slice(10));
    else if (a.startsWith("--pricing=")) pricing = resolve(a.slice(10));
    else if (a.startsWith("--models=")) models = a.slice(9).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--scenarios=")) scenarios = a.slice(12).split(",").map((s) => s.trim()) as Scenario[];
    else if (a.startsWith("--queries=")) {
      const v = a.slice(10);
      queries = v === "canonical5" || v === "all" ? v : v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("--max-output-tokens=")) maxOutputTokens = Number(a.slice(20));
    else if (a.startsWith("--max-usd=")) maxUsd = Number(a.slice(10));
    else if (a === "--execute") execute = true;
    else if (a.startsWith("--out-dir=")) outDir = resolve(a.slice(10));
  }
  return { fixture, pricing, models, scenarios, queries, maxOutputTokens, maxUsd, execute, outDir };
}

function scenarioFiles(listings: BenchmarkListing[], scenario: Scenario): string[] {
  if (scenario === "raw") return listings.flatMap((l) => l.sourceBundle);
  return listings.map((l) => l.artifactPath);
}

function scenarioInline(userQuery: string, scenario: Scenario): string {
  if (scenario === "raw") {
    return [
      "Workflow: raw",
      "User query:",
      userQuery,
      "Instruction: answer from the full raw source bundle and report missing evidence.",
      "Raw sources follow as context.",
    ].join("\n");
  }
  return [
    "Workflow: proofweave_artifact",
    "User query:",
    userQuery,
    "Instruction: answer from the selected ProofWeave artifact context and report whether it is sufficient.",
    "Selected artifacts follow as context.",
  ].join("\n");
}

function buildUserMessage(fixture: BenchmarkFixture, queryId: string, scenario: Scenario): { text: string; listingIds: string[] } {
  const byListing = listingMap(fixture);
  const byJudgment = judgmentMap(fixture);
  const query = fixture.queries.find((q) => q.queryId === queryId);
  if (!query) throw new Error(`unknown query ${queryId}`);
  const judgment = byJudgment.get(queryId);
  const expectedIds = judgment?.relevantListingIds ?? query.expectedListingIds;
  const listings = getListingsOrThrow(expectedIds, byListing, queryId);
  const files = [...new Set(scenarioFiles(listings, scenario))];
  const context = files.map((f) => readFileSync(fixtureRelativePath(f), "utf8")).join("\n");
  return { text: `${scenarioInline(query.userQuery, scenario)}\n\n${context}`, listingIds: expectedIds };
}

// ── provider 어댑터 (REST; raw usage 보존) ──────────────────────
// 반환: { inputTokens, outputTokens, totalTokens, reasoningTokens, cacheReadTokens, text, raw }
interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  text: string;
  raw: unknown;
}

async function callOpenAI(modelId: string, key: string, system: string, user: string, maxOut: number): Promise<Usage> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modelId, instructions: system, input: user, max_output_tokens: maxOut, temperature: 0 }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const u = j.usage ?? {};
  return {
    inputTokens: u.input_tokens ?? null,
    outputTokens: u.output_tokens ?? null,
    totalTokens: u.total_tokens ?? null,
    reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? null,
    cacheReadTokens: u.input_tokens_details?.cached_tokens ?? null,
    text: j.output_text ?? "",
    raw: u,
  };
}

async function callAnthropic(modelId: string, key: string, system: string, user: string, maxOut: number): Promise<Usage> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: modelId, system, messages: [{ role: "user", content: user }], max_tokens: maxOut, temperature: 0 }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const u = j.usage ?? {};
  const inTok = u.input_tokens ?? null;
  const outTok = u.output_tokens ?? null;
  return {
    inputTokens: inTok,
    outputTokens: outTok,
    totalTokens: inTok != null && outTok != null ? inTok + outTok : null,
    reasoningTokens: null,
    cacheReadTokens: u.cache_read_input_tokens ?? null,
    text: Array.isArray(j.content) ? j.content.map((c: any) => c.text ?? "").join("") : "",
    raw: u,
  };
}

async function callGemini(modelId: string, key: string, system: string, user: string, maxOut: number): Promise<Usage> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxOut, temperature: 0 },
    }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`gemini ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const m = j.usageMetadata ?? {};
  return {
    inputTokens: m.promptTokenCount ?? null,
    outputTokens: m.candidatesTokenCount ?? null,
    totalTokens: m.totalTokenCount ?? null,
    reasoningTokens: m.thoughtsTokenCount ?? null,
    cacheReadTokens: m.cachedContentTokenCount ?? null,
    text: j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "",
    raw: m,
  };
}

function callProvider(provider: string, modelId: string, key: string, system: string, user: string, maxOut: number): Promise<Usage> {
  if (provider === "openai") return callOpenAI(modelId, key, system, user, maxOut);
  if (provider === "anthropic") return callAnthropic(modelId, key, system, user, maxOut);
  if (provider === "google") return callGemini(modelId, key, system, user, maxOut);
  throw new Error(`unknown provider ${provider}`);
}

function estCost(price: any, inputTok: number, outputTok: number): number | null {
  if (price.inputPerMtok == null || price.outputPerMtok == null) return null;
  return inputTok / 1e6 * price.inputPerMtok + outputTok / 1e6 * price.outputPerMtok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = loadBenchmarkFixture(args.fixture);
  const pricing = JSON.parse(readFileSync(args.pricing, "utf8"));
  const allModelIds = Object.keys(pricing.models);
  const modelIds = args.models ?? allModelIds;
  const queryIds =
    args.queries === "canonical5" ? CANONICAL5 :
    args.queries === "all" ? fixture.queries.map((q) => q.queryId) :
    args.queries;

  mkdirSync(args.outDir, { recursive: true });

  // ── 1) 사전 projection (항상 offline, API 호출 0) ──
  const plan: any[] = [];
  let projectedTotalCost = 0;
  let anyPriceMissing = false;
  for (const modelId of modelIds) {
    const price = pricing.models[modelId];
    if (!price) throw new Error(`pricing missing for model ${modelId}`);
    for (const queryId of queryIds) {
      for (const scenario of args.scenarios) {
        const { text, listingIds } = buildUserMessage(fixture, queryId, scenario);
        const projInput = (await countText(`${SYSTEM_PROMPT}\n\n${text}`, "proj")).ctt; // o200k proxy
        const cost = estCost(price, projInput, args.maxOutputTokens);
        if (cost == null) anyPriceMissing = true; else projectedTotalCost += cost;
        plan.push({ modelId, provider: price.provider, providerModelId: price.providerModelId, queryId, scenario, projInputTokensO200k: projInput, projMaxOutputTokens: args.maxOutputTokens, projCostUsd: cost, listingIds });
      }
    }
  }

  console.log(`=== run-live-model-benchmark (${args.execute ? "EXECUTE" : "DRY-RUN"}) ===`);
  console.log(`models=${modelIds.join(",")} scenarios=${args.scenarios.join(",")} queries=${queryIds.length} calls=${plan.length} maxOutput=${args.maxOutputTokens}`);
  console.log(`projected input tokens (o200k proxy, sum)=${plan.reduce((s, p) => s + p.projInputTokensO200k, 0)}`);
  console.log(`projected cost (priced models only, output=max)= $${projectedTotalCost.toFixed(6)}${anyPriceMissing ? "  (일부 모델 단가 미검증 → cost 제외)" : ""}`);
  writeFileSync(join(args.outDir, "live-plan.json"), JSON.stringify({ args: { ...args }, projectedTotalCostPriced: projectedTotalCost, anyPriceMissing, plan }, null, 2), "utf8");

  if (!args.execute) {
    console.log(`DRY-RUN: API 호출 안 함. 실행하려면 --execute --max-usd=<cap> + 키 + providerModelId/단가 필요.`);
    console.log(`wrote ${join(args.outDir, "live-plan.json")}`);
    return;
  }

  // ── 2) EXECUTE 가드 ──
  if (args.maxUsd == null) throw new Error("--execute 에는 --max-usd=<cap> 가 필수다 (비용 상한).");
  if (anyPriceMissing) throw new Error("단가 미검증 모델이 있다. pricing config의 inputPerMtok/outputPerMtok 를 채운 뒤 실행하라.");
  if (projectedTotalCost > args.maxUsd) throw new Error(`projected cost $${projectedTotalCost.toFixed(6)} > cap $${args.maxUsd}. --max-usd 상향 또는 데이터셋 축소.`);
  for (const modelId of modelIds) {
    const price = pricing.models[modelId];
    if (!price.providerModelId) throw new Error(`${modelId}: providerModelId 미설정.`);
    const key = process.env[price.apiKeyEnv];
    if (!key) throw new Error(`${modelId}: 환경변수 ${price.apiKeyEnv} 없음.`);
  }

  // ── 3) 실행 (concurrency=1, 재시도 없음, 누적 비용 cap 추적) ──
  const results: any[] = [];
  let spent = 0;
  for (const item of plan) {
    const price = pricing.models[item.modelId];
    const key = process.env[price.apiKeyEnv] as string;
    const { text } = buildUserMessage(fixture, item.queryId, item.scenario);
    // 다음 호출 전, 최악(=projected) 비용을 더해도 cap을 넘기면 중단
    if (spent + (item.projCostUsd ?? 0) > args.maxUsd) {
      console.warn(`[stop] 누적 $${spent.toFixed(6)} + 다음 $${(item.projCostUsd ?? 0).toFixed(6)} > cap $${args.maxUsd}. 중단.`);
      break;
    }
    const startedAt = Date.now();
    try {
      const u = await callProvider(price.provider, price.providerModelId, key, SYSTEM_PROMPT, text, args.maxOutputTokens);
      const cost = u.inputTokens != null && u.outputTokens != null ? estCost(price, u.inputTokens, u.outputTokens) : null;
      if (cost != null) spent += cost;
      results.push({
        benchmarkVersion: "v2-live", usageSource: "provider_usage_metadata",
        modelId: item.modelId, provider: price.provider, providerModelId: price.providerModelId,
        queryId: item.queryId, scenarioId: item.scenario,
        inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens,
        reasoningTokens: u.reasoningTokens, cacheReadTokens: u.cacheReadTokens,
        estimatedCostUsd: cost, latencyMs: Date.now() - startedAt,
        answerChars: u.text.length, providerUsageRaw: u.raw, error: null,
      });
      console.log(`ok ${item.modelId} ${item.queryId} ${item.scenario} in=${u.inputTokens} out=${u.outputTokens} cost=${cost == null ? "n/a" : "$" + cost.toFixed(6)} spent=$${spent.toFixed(6)}`);
    } catch (err) {
      results.push({
        benchmarkVersion: "v2-live", usageSource: "provider_usage_metadata",
        modelId: item.modelId, provider: price.provider, queryId: item.queryId, scenarioId: item.scenario,
        inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null,
        latencyMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err),
      });
      console.warn(`ERR ${item.modelId} ${item.queryId} ${item.scenario}: ${err instanceof Error ? err.message : err}`);
    }
  }

  writeFileSync(join(args.outDir, "live-results.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`\n총 추정 비용 spent= $${spent.toFixed(6)} (cap $${args.maxUsd}). rows=${results.length}`);
  console.log(`wrote ${join(args.outDir, "live-results.jsonl")}`);
  console.log(`다음: predict-live-from-offline.ts --measured=${join(args.outDir, "live-results.jsonl")} 로 나머지 query 재예측.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
