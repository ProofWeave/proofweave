import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { countText, type CountResult } from "./count-canonical.js";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const FIXTURES = join(ROOT, "fixtures");
let activeFixturesRoot = FIXTURES;

export const REQUIRED_MODEL_IDS = [
  "claude-opus-4.8",
  "gpt-5.5-fast-high",
  "gemini-3.5-flash",
] as const;

export type RequiredModelId = (typeof REQUIRED_MODEL_IDS)[number];
export type ProviderUsageMode = "future_live_mode_extension_only";

export interface ScenarioConfig {
  defaultTopK: number;
  offlineOnly: boolean;
  providerUsageMode: ProviderUsageMode;
}

export interface ModelConfig {
  modelId: string;
  modelLabel?: string;
  provider: string;
  providerModelId?: string | null;
  offlineContextBudgetTokens: number;
  offlineOutputBudgetTokens: number;
  usageSource: "offline_proxy_only";
}

export interface QualityRubric {
  mustInclude: string[];
  mustNotHallucinate: string[];
  passThreshold: number;
}

export interface BenchmarkQuery {
  queryId: string;
  domain: string;
  userQuery: string;
  expectedListingIds: string[];
  expectedListingKinds: string[];
  noMatchExpected?: boolean;
  qualityRubric?: QualityRubric;
}

export interface BenchmarkListing {
  attestationId: string;
  kind: string;
  title: string;
  domain?: string;
  problemType?: string;
  sourceBundle: string[];
  artifactPath: string;
  createdAt?: string;
  priceUsdMicros?: number;
  freshnessWindowDays?: number;
  sourceUrls?: string[];
  licenseNote?: string;
  tags?: string[];
  keywords?: string[];
  synopsis?: string;
}

export interface RetrievalJudgment {
  queryId: string;
  relevantListingIds: string[];
  noMatchExpected: boolean;
}

export interface RetrievedTopK {
  queryId: string;
  source: "fixture" | "matcher";
  listingIds: string[];
}

export interface BenchmarkFixture {
  schemaVersion: string;
  description?: string;
  scenarioConfig: ScenarioConfig;
  modelConfig: ModelConfig[];
  datasetConfig?: Record<string, unknown>;
  queries: BenchmarkQuery[];
  listings: BenchmarkListing[];
  retrievalJudgments: RetrievalJudgment[];
  retrievedTopK: RetrievedTopK[];
}

export interface TokenContext {
  files: string[];
  inlineLabels: string[];
  listingIds: string[];
  ctt: number;
  cb: number;
  cttMethod: CountResult["ctt_method"];
}

export function defaultFixturePath(): string {
  return join(FIXTURES, "benchmark-v2.full.json");
}

export function fixturesRoot(): string {
  return activeFixturesRoot;
}

export function loadBenchmarkFixture(path = defaultFixturePath()): BenchmarkFixture {
  const fixturePath = resolve(path);
  activeFixturesRoot = dirname(fixturePath);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as BenchmarkFixture;
  validateFixture(fixture, fixturePath);
  return fixture;
}

export function listingMap(fixture: BenchmarkFixture): Map<string, BenchmarkListing> {
  return new Map(fixture.listings.map((listing) => [listing.attestationId, listing]));
}

export function judgmentMap(fixture: BenchmarkFixture): Map<string, RetrievalJudgment> {
  return new Map(fixture.retrievalJudgments.map((judgment) => [judgment.queryId, judgment]));
}

export function retrievedTopKMap(fixture: BenchmarkFixture): Map<string, RetrievedTopK> {
  return new Map(fixture.retrievedTopK.map((row) => [row.queryId, row]));
}

export function pct(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((sum, n) => sum + n, 0) / xs.length;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function fixtureRelativePath(pathFromFixtureRoot: string): string {
  const abs = resolve(activeFixturesRoot, pathFromFixtureRoot);
  const rel = relative(activeFixturesRoot, abs);
  if (rel.startsWith("..") || rel === "" || rel.split(sep).includes("..")) {
    throw new Error(`fixture path escapes fixtures/: ${pathFromFixtureRoot}`);
  }
  if (!existsSync(abs)) {
    throw new Error(`fixture file missing: ${abs}`);
  }
  return abs;
}

export async function countFixtureFiles(
  files: string[],
  listingIds: string[],
  inlineTexts: Array<{ label: string; text: string }> = [],
): Promise<TokenContext> {
  let ctt = 0;
  let cb = 0;
  let cttMethod: CountResult["ctt_method"] = "bytes_div_4_fallback";

  // 동일 파일이 여러 listing에서 재사용되면 컨텍스트에 한 번만 넣는다.
  // v2 benchmark는 billing 검증이 아니라 "전달한 context 크기" 비교이므로
  // 중복 제거 여부를 명시적으로 고정해야 반복 실행 결과가 안정적이다.
  const dedupedFiles = unique(files);
  for (const file of dedupedFiles) {
    const abs = fixtureRelativePath(file);
    const text = readFileSync(abs, "utf8");
    const count = await countText(text, file);
    ctt += count.ctt;
    cb += count.cb;
    cttMethod = count.ctt_method;
  }

  // 실제 LLM context에는 파일 본문만 들어가지 않는다. user query, instruction,
  // "raw sources" / "selected artifact" 같은 wrapper도 입력 token에 포함되므로
  // benchmark v2에서는 inline prompt 조각도 같이 센다.
  for (const item of inlineTexts) {
    const count = await countText(item.text, item.label);
    ctt += count.ctt;
    cb += count.cb;
    cttMethod = count.ctt_method;
  }

  return {
    files: dedupedFiles,
    inlineLabels: inlineTexts.map((item) => item.label),
    listingIds: unique(listingIds),
    ctt,
    cb,
    cttMethod,
  };
}

export function getListingsOrThrow(
  ids: string[],
  byId: Map<string, BenchmarkListing>,
  label: string,
): BenchmarkListing[] {
  return ids.map((id) => {
    const listing = byId.get(id);
    if (!listing) {
      throw new Error(`${label} references unknown listing id: ${id}`);
    }
    return listing;
  });
}

export function topKFromFixture(
  queryId: string,
  topK: number,
  fixture: BenchmarkFixture,
): string[] {
  const topKByQuery = retrievedTopKMap(fixture);
  return (topKByQuery.get(queryId)?.listingIds ?? []).slice(0, topK);
}

function validateFixture(fixture: BenchmarkFixture, path: string): void {
  if (!fixture.scenarioConfig.offlineOnly) {
    throw new Error(`${path}: benchmark v2 fixture must be offlineOnly=true`);
  }
  if (fixture.scenarioConfig.providerUsageMode !== "future_live_mode_extension_only") {
    throw new Error(`${path}: providerUsageMode must stay future/live extension only`);
  }
  if (!Number.isInteger(fixture.scenarioConfig.defaultTopK) || fixture.scenarioConfig.defaultTopK <= 0) {
    throw new Error(`${path}: scenarioConfig.defaultTopK must be a positive integer`);
  }

  // 모델 비교 대상은 문서/fixture/config에서 정확히 이 3개로 고정한다.
  // 여기서 실패시키면 새 모델을 실수로 추가하거나 기존 이름을 바꾸는 drift를 초기에 잡을 수 있다.
  const actualModelIds = fixture.modelConfig.map((model) => model.modelId).sort();
  const requiredModelIds = [...REQUIRED_MODEL_IDS].sort();
  if (JSON.stringify(actualModelIds) !== JSON.stringify(requiredModelIds)) {
    throw new Error(
      `${path}: modelConfig must contain exactly ${REQUIRED_MODEL_IDS.join(", ")}`,
    );
  }
  for (const model of fixture.modelConfig) {
    if (model.modelLabel && model.modelLabel !== model.modelId) {
      throw new Error(`${path}: modelLabel must equal modelId for offline v2 labels`);
    }
  }

  const queryIds = new Set<string>();
  for (const query of fixture.queries) {
    if (queryIds.has(query.queryId)) throw new Error(`${path}: duplicate queryId ${query.queryId}`);
    queryIds.add(query.queryId);
    if (query.qualityRubric) {
      if (!Array.isArray(query.qualityRubric.mustInclude)) {
        throw new Error(`${path}: query ${query.queryId} qualityRubric.mustInclude must be an array`);
      }
      if (!Array.isArray(query.qualityRubric.mustNotHallucinate)) {
        throw new Error(`${path}: query ${query.queryId} qualityRubric.mustNotHallucinate must be an array`);
      }
      if (
        typeof query.qualityRubric.passThreshold !== "number" ||
        query.qualityRubric.passThreshold < 0 ||
        query.qualityRubric.passThreshold > 1
      ) {
        throw new Error(`${path}: query ${query.queryId} qualityRubric.passThreshold must be between 0 and 1`);
      }
    }
  }

  const listingIds = new Set<string>();
  for (const listing of fixture.listings) {
    if (listingIds.has(listing.attestationId)) {
      throw new Error(`${path}: duplicate attestationId ${listing.attestationId}`);
    }
    listingIds.add(listing.attestationId);
    for (const source of listing.sourceBundle) fixtureRelativePath(source);
    fixtureRelativePath(listing.artifactPath);
  }

  for (const query of fixture.queries) {
    for (const id of query.expectedListingIds) {
      if (!listingIds.has(id)) throw new Error(`${path}: query ${query.queryId} expects unknown listing ${id}`);
    }
  }

  for (const judgment of fixture.retrievalJudgments) {
    if (!queryIds.has(judgment.queryId)) {
      throw new Error(`${path}: retrieval judgment references unknown query ${judgment.queryId}`);
    }
    for (const id of judgment.relevantListingIds) {
      if (!listingIds.has(id)) {
        throw new Error(`${path}: retrieval judgment references unknown listing ${id}`);
      }
    }
  }

  for (const row of fixture.retrievedTopK) {
    if (!queryIds.has(row.queryId)) {
      throw new Error(`${path}: retrievedTopK references unknown query ${row.queryId}`);
    }
    for (const id of row.listingIds) {
      if (!listingIds.has(id)) throw new Error(`${path}: retrievedTopK references unknown listing ${id}`);
    }
  }
}
