// CLI:
//   tsx scripts/run-retrieval-benchmark.ts [--fixture=fixtures/benchmark-v2.sample.json]
//     [--source=fixture|matcher] [--top-k=3] [--matcher-min-score=1] [--out-dir=<dir>]
//
// 이 스크립트는 retrieval/matching 품질만 본다. 토큰 절감률은 의도적으로
// 계산하지 않는다. 같은 fixture로도 token benchmark와 retrieval benchmark를
// 따로 돌려야 "저렴하지만 틀린 검색"을 좋은 결과로 오해하지 않는다.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defaultFixturePath,
  fixtureRelativePath,
  fixturesRoot,
  judgmentMap,
  listingMap,
  loadBenchmarkFixture,
  pct,
  topKFromFixture,
  type BenchmarkFixture,
  type BenchmarkListing,
} from "./benchmark-v2-utils.js";

interface Args {
  fixture: string;
  source: "fixture" | "matcher";
  topK: number | null;
  matcherMinScore: number;
  outDir: string | null;
}

interface RetrievalRecord {
  queryId: string;
  domain: string;
  source: Args["source"];
  topK: number;
  expectedListingIds: string[];
  retrievedListingIds: string[];
  expectedNoMatch: boolean;
  predictedNoMatch: boolean;
  hitAt1: boolean | null;
  hitAt3: boolean | null;
  hitAt5: boolean | null;
  hitAtK: boolean | null;
  reciprocalRank: number | null;
  firstRelevantRank: number | null;
  ndcgAt5: number | null;
}

interface RetrievalSummary {
  source: Args["source"];
  topK: number;
  queryCount: number;
  matchQueryCount: number;
  noMatchQueryCount: number;
  hitAt1: number | null;
  hitAt3: number | null;
  hitAt5: number | null;
  hitAtK: number | null;
  mrr: number | null;
  ndcgAt5: number | null;
  noMatchPrecision: number | null;
  noMatchRecall: number | null;
}

interface RetrievalDomainSummary extends RetrievalSummary {
  domain: string;
}

function parseArgs(argv: string[]): Args {
  let fixture = defaultFixturePath();
  let source: Args["source"] = "fixture";
  let topK: number | null = null;
  let matcherMinScore = 1;
  let outDir: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith("--fixture=")) fixture = resolve(arg.slice("--fixture=".length));
    else if (arg.startsWith("--source=")) {
      const rawSource = arg.slice("--source=".length);
      if (rawSource !== "fixture" && rawSource !== "matcher") {
        throw new Error("--source must be fixture or matcher");
      }
      source = rawSource;
    } else if (arg.startsWith("--top-k=")) {
      topK = Number(arg.slice("--top-k=".length));
    } else if (arg.startsWith("--matcher-min-score=")) {
      matcherMinScore = Number(arg.slice("--matcher-min-score=".length));
    } else if (arg.startsWith("--out-dir=")) {
      outDir = resolve(arg.slice("--out-dir=".length));
    }
  }

  if (topK !== null && (!Number.isInteger(topK) || topK <= 0)) {
    throw new Error("--top-k must be a positive integer");
  }
  if (!Number.isFinite(matcherMinScore) || matcherMinScore < 0) {
    throw new Error("--matcher-min-score must be zero or a positive number");
  }

  return { fixture, source, topK, matcherMinScore, outDir };
}

function tokenize(text: string): string[] {
  // 한글/영문/숫자 토큰을 모두 살리되, 너무 짧은 조사성 토큰은 노이즈가 커서 제외한다.
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}_./-]+/gu)
      ?.filter((token) => token.length >= 3) ?? []
  );
}

function listingSearchText(listing: BenchmarkListing): string {
  const artifactText = readFileSync(fixtureRelativePath(listing.artifactPath), "utf8");
  return [
    listing.attestationId,
    listing.kind,
    listing.title,
    listing.domain ?? "",
    listing.problemType ?? "",
    listing.synopsis ?? "",
    ...(listing.tags ?? []),
    ...(listing.keywords ?? []),
    artifactText,
  ].join("\n");
}

function scoreListing(query: string, listing: BenchmarkListing): number {
  const queryTokens = new Set(tokenize(query));
  const listingTokens = new Set(tokenize(listingSearchText(listing)));
  let score = 0;

  for (const token of queryTokens) {
    if (listingTokens.has(token)) score += 1;
  }

  // 제목과 태그 매치는 작은 fixture에서 더 강한 signal로 본다.
  // 이 matcher는 live retrieval을 대체하는 품질 기준이 아니라 offline 반복 실행용 baseline이다.
  const titleAndTags = `${listing.title} ${(listing.tags ?? []).join(" ")}`.toLowerCase();
  for (const token of queryTokens) {
    if (titleAndTags.includes(token)) score += 2;
  }

  return score;
}

function retrieveWithLocalMatcher(
  query: string,
  listings: BenchmarkListing[],
  topK: number,
  minScore: number,
): string[] {
  return listings
    .map((listing) => ({
      id: listing.attestationId,
      title: listing.title,
      score: scoreListing(query, listing),
    }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, topK)
    .map((row) => row.id);
}

function retrievedIdsForQuery(
  fixture: BenchmarkFixture,
  source: Args["source"],
  queryId: string,
  userQuery: string,
  topK: number,
  matcherMinScore: number,
): string[] {
  if (source === "fixture") return topKFromFixture(queryId, topK, fixture);
  return retrieveWithLocalMatcher(userQuery, fixture.listings, topK, matcherMinScore);
}

function reciprocalRank(retrieved: string[], expected: Set<string>): number | null {
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.has(retrieved[i]!)) return 1 / (i + 1);
  }
  return null;
}

function hitAt(retrieved: string[], expected: Set<string>, k: number): boolean {
  return retrieved.slice(0, k).some((id) => expected.has(id));
}

function ndcgAt(retrieved: string[], expected: Set<string>, k: number): number {
  const dcg = retrieved.slice(0, k).reduce((sum, id, idx) => {
    const rel = expected.has(id) ? 1 : 0;
    return sum + (Math.pow(2, rel) - 1) / Math.log2(idx + 2);
  }, 0);
  const idealHits = Math.min(expected.size, k);
  let idealDcg = 0;
  for (let idx = 0; idx < idealHits; idx++) {
    idealDcg += 1 / Math.log2(idx + 2);
  }
  return idealDcg === 0 ? 0 : dcg / idealDcg;
}

function summarize(records: RetrievalRecord[], source: Args["source"], topK: number): RetrievalSummary {
  const matchRecords = records.filter((record) => !record.expectedNoMatch);
  const noMatchRecords = records.filter((record) => record.expectedNoMatch);
  const hitCount = matchRecords.filter((record) => record.hitAtK).length;
  const hitAt1Count = matchRecords.filter((record) => record.hitAt1).length;
  const hitAt3Count = matchRecords.filter((record) => record.hitAt3).length;
  const hitAt5Count = matchRecords.filter((record) => record.hitAt5).length;
  const rrValues = matchRecords.map((record) => record.reciprocalRank ?? 0);
  const ndcgValues = matchRecords.map((record) => record.ndcgAt5 ?? 0);
  const predictedNoMatch = records.filter((record) => record.predictedNoMatch);
  const truePredictedNoMatch = predictedNoMatch.filter((record) => record.expectedNoMatch);
  const trueNoMatch = noMatchRecords.filter((record) => record.predictedNoMatch);

  return {
    source,
    topK,
    queryCount: records.length,
    matchQueryCount: matchRecords.length,
    noMatchQueryCount: noMatchRecords.length,
    hitAt1: matchRecords.length === 0 ? null : hitAt1Count / matchRecords.length,
    hitAt3: matchRecords.length === 0 ? null : hitAt3Count / matchRecords.length,
    hitAt5: matchRecords.length === 0 ? null : hitAt5Count / matchRecords.length,
    hitAtK: matchRecords.length === 0 ? null : hitCount / matchRecords.length,
    mrr:
      matchRecords.length === 0
        ? null
        : rrValues.reduce((sum, n) => sum + n, 0) / matchRecords.length,
    ndcgAt5:
      matchRecords.length === 0
        ? null
        : ndcgValues.reduce((sum, n) => sum + n, 0) / matchRecords.length,
    noMatchPrecision:
      predictedNoMatch.length === 0
        ? null
        : truePredictedNoMatch.length / predictedNoMatch.length,
    noMatchRecall:
      noMatchRecords.length === 0 ? null : trueNoMatch.length / noMatchRecords.length,
  };
}

function summarizeByDomain(
  records: RetrievalRecord[],
  source: Args["source"],
  topK: number,
): RetrievalDomainSummary[] {
  return [...new Set(records.map((record) => record.domain))]
    .sort()
    .map((domain) => ({
      domain,
      ...summarize(
        records.filter((record) => record.domain === domain),
        source,
        topK,
      ),
    }));
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

function retrievalSummaryRows(rows: RetrievalDomainSummary[]): Array<Record<string, unknown>> {
  return rows.map((summary) => ({
    domain: summary.domain,
    source: summary.source,
    topK: summary.topK,
    queryCount: summary.queryCount,
    matchQueryCount: summary.matchQueryCount,
    noMatchQueryCount: summary.noMatchQueryCount,
    hitAt1: summary.hitAt1,
    hitAt3: summary.hitAt3,
    hitAt5: summary.hitAt5,
    hitAtK: summary.hitAtK,
    mrr: summary.mrr,
    ndcgAt5: summary.ndcgAt5,
    noMatchPrecision: summary.noMatchPrecision,
    noMatchRecall: summary.noMatchRecall,
  }));
}

function writeMarkdownSummary(
  outDir: string,
  summary: RetrievalSummary,
  domainSummaries: RetrievalDomainSummary[],
): void {
  const domainRows = domainSummaries
    .map(
      (row) =>
        `| ${row.domain} | ${row.queryCount} | ${pct(row.hitAt1)} | ${pct(row.hitAtK)} | ${row.mrr === null ? "n/a" : row.mrr.toFixed(4)} | ${row.ndcgAt5 === null ? "n/a" : row.ndcgAt5.toFixed(4)} | ${pct(row.noMatchRecall)} |`,
    )
    .join("\n");

  writeFileSync(
    join(outDir, "retrieval-summary.md"),
    [
      "# Retrieval Benchmark Summary",
      "",
      `Source: ${summary.source}`,
      `Top-K: ${summary.topK}`,
      "",
      "## Overall",
      "",
      `- Queries: ${summary.queryCount}`,
      `- Hit@1: ${pct(summary.hitAt1)}`,
      `- Hit@K: ${pct(summary.hitAtK)}`,
      `- MRR: ${summary.mrr === null ? "n/a" : summary.mrr.toFixed(4)}`,
      `- nDCG@5: ${summary.ndcgAt5 === null ? "n/a" : summary.ndcgAt5.toFixed(4)}`,
      `- no-match precision: ${pct(summary.noMatchPrecision)}`,
      `- no-match recall: ${pct(summary.noMatchRecall)}`,
      "",
      "## Domain Summary",
      "",
      "| domain | queries | Hit@1 | Hit@K | MRR | nDCG@5 | no-match recall |",
      "|---|---:|---:|---:|---:|---:|---:|",
      domainRows,
      "",
    ].join("\n"),
    "utf8",
  );
}

function printSummary(summary: RetrievalSummary): void {
  console.log(`retrieval benchmark (${summary.source}, topK=${summary.topK})`);
  console.log(`queries: ${summary.queryCount}`);
  console.log(`Hit@1: ${pct(summary.hitAt1)}`);
  console.log(`Hit@3: ${pct(summary.hitAt3)}`);
  console.log(`Hit@5: ${pct(summary.hitAt5)}`);
  console.log(`Hit@K: ${pct(summary.hitAtK)}`);
  console.log(`MRR: ${summary.mrr === null ? "n/a" : summary.mrr.toFixed(4)}`);
  console.log(`nDCG@5: ${summary.ndcgAt5 === null ? "n/a" : summary.ndcgAt5.toFixed(4)}`);
  console.log(`no-match precision: ${pct(summary.noMatchPrecision)}`);
  console.log(`no-match recall: ${pct(summary.noMatchRecall)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = loadBenchmarkFixture(args.fixture);
  const topK = args.topK ?? fixture.scenarioConfig.defaultTopK;
  const byJudgment = judgmentMap(fixture);
  const byListingId = listingMap(fixture);

  // fixture validation에서 대부분 잡지만, matcher 경로가 추가될 때도 unknown listing을
  // 빠르게 발견하도록 Map을 실제로 참조한다.
  for (const listing of fixture.listings) byListingId.get(listing.attestationId);

  const records: RetrievalRecord[] = fixture.queries.map((query) => {
    const judgment = byJudgment.get(query.queryId);
    const expectedListingIds = judgment?.relevantListingIds ?? query.expectedListingIds;
    const expected = new Set(expectedListingIds);
    const expectedNoMatch = judgment?.noMatchExpected ?? expectedListingIds.length === 0;
    const retrievedListingIds = retrievedIdsForQuery(
      fixture,
      args.source,
      query.queryId,
      query.userQuery,
      topK,
      args.matcherMinScore,
    );
    const rr = reciprocalRank(retrievedListingIds, expected);
    const firstRelevantRank = rr === null ? null : Math.round(1 / rr);
    const hitAt1 = hitAt(retrievedListingIds, expected, 1);
    const hitAt3 = hitAt(retrievedListingIds, expected, 3);
    const hitAt5 = hitAt(retrievedListingIds, expected, 5);

    return {
      queryId: query.queryId,
      domain: query.domain,
      source: args.source,
      topK,
      expectedListingIds,
      retrievedListingIds,
      expectedNoMatch,
      predictedNoMatch: retrievedListingIds.length === 0,
      hitAt1: expectedNoMatch ? null : hitAt1,
      hitAt3: expectedNoMatch ? null : hitAt3,
      hitAt5: expectedNoMatch ? null : hitAt5,
      hitAtK: expectedNoMatch ? null : rr !== null,
      reciprocalRank: expectedNoMatch ? null : rr ?? 0,
      firstRelevantRank: expectedNoMatch ? null : firstRelevantRank,
      ndcgAt5: expectedNoMatch ? null : ndcgAt(retrievedListingIds, expected, 5),
    };
  });

  const summary = summarize(records, args.source, topK);
  const domainSummaries = summarizeByDomain(records, args.source, topK);

  if (args.outDir) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(
      join(args.outDir, "retrieval-results.jsonl"),
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );
    writeFileSync(
      join(args.outDir, "retrieval-summary.json"),
      JSON.stringify(
        {
          fixtureRoot: fixturesRoot(),
          fixture: args.fixture,
          matcherMinScore: args.matcherMinScore,
          summary,
          domainSummaries,
          visualization: {
            domainSummaryCsv: "retrieval-domain-summary.csv",
            markdownSummary: "retrieval-summary.md",
            recommendedChartKeys: ["hitAt1", "hitAtK", "mrr", "ndcgAt5", "noMatchRecall"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      join(args.outDir, "retrieval-domain-summary.csv"),
      toCsv(retrievalSummaryRows(domainSummaries)),
      "utf8",
    );
    writeMarkdownSummary(args.outDir, summary, domainSummaries);
  }

  printSummary(summary);
  if (args.outDir) console.log(`wrote retrieval outputs to ${args.outDir}`);
}

main();
