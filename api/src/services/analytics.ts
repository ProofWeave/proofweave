import { pool } from "./db.js";

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";
export type AccessType = "paid" | "free" | "receipt";

export interface AnalyticsSummaryResponse {
  range: AnalyticsRange;
  summary: {
    directLlmCalls: number;
    directInputTokens: number;
    directOutputTokens: number;
    directCostUsdMicros: number;
    baselineAttestations: number;
    uniqueReuseEvents: number;
    avoidedInputTokens: number;
    avoidedOutputTokens: number;
    avoidedCostUsdMicros: number;
    actualReuseLlmCostUsdMicros: number;
    netAvoidedLlmCostUsdMicros: number;
    averageReuseEfficiency: number;
    meteredReuseRatio: number;
  };
  trend: Array<{
    day: string;
    uniqueReuseEvents: number;
    avoidedTokens: number;
    avoidedCostUsdMicros: number;
  }>;
  byModel: Array<{
    model: string;
    uniqueReuseEvents: number;
    avoidedTokens: number;
    avoidedCostUsdMicros: number;
  }>;
  recentReuse: Array<{
    attestationId: string;
    title?: string;
    domain?: string;
    model: string;
    avoidedTokens: number;
    avoidedCostUsdMicros: number;
    reusedAt: string;
  }>;
}

export function usdToMicros(value: number): number {
  return Math.round(value * 1_000_000);
}

export async function recordLlmUsage(params: {
  owner: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsdMicros: number;
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO llm_usage_events
       (owner, provider, model, input_tokens, output_tokens, estimated_cost_usd_micros)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      params.owner.toLowerCase(),
      params.provider,
      params.model,
      Math.max(0, Math.floor(params.inputTokens)),
      Math.max(0, Math.floor(params.outputTokens)),
      Math.max(0, Math.floor(params.estimatedCostUsdMicros)),
    ]
  );

  return result.rows[0].id;
}

export async function assertUsageEventLinkable(
  usageEventId: string,
  owner: string
): Promise<void> {
  const result = await pool.query(
    `SELECT 1
       FROM llm_usage_events lue
       LEFT JOIN attestation_token_baselines atb
         ON atb.llm_usage_event_id = lue.id
      WHERE lue.id = $1
        AND lue.owner = $2
        AND atb.attestation_id IS NULL`,
    [usageEventId, owner.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new Error("Invalid, foreign, or already linked usageEventId");
  }
}

export async function linkUsageToAttestation(params: {
  usageEventId: string;
  attestationId: string;
  owner: string;
}): Promise<void> {
  const result = await pool.query(
    `INSERT INTO attestation_token_baselines
       (attestation_id, llm_usage_event_id, owner, model, input_tokens, output_tokens, estimated_cost_usd_micros)
     SELECT
       $1,
       id,
       owner,
       model,
       input_tokens,
       output_tokens,
       estimated_cost_usd_micros
     FROM llm_usage_events
     WHERE id = $2 AND owner = $3
     ON CONFLICT (attestation_id) DO NOTHING`,
    [params.attestationId, params.usageEventId, params.owner.toLowerCase()]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error("Failed to link usageEventId to attestation");
  }
}

export async function recordDataReuseOnce(params: {
  attestationId: string;
  consumer: string;
  receiptId?: string | null;
  accessType: AccessType;
}): Promise<void> {
  await pool.query(
    `INSERT INTO data_reuse_events
       (attestation_id, consumer, receipt_id, access_type, metered,
        avoided_input_tokens, avoided_output_tokens, avoided_cost_usd_micros)
     SELECT
       $1,
       $2,
       $3,
       $4,
       (atb.attestation_id IS NOT NULL),
       COALESCE(atb.input_tokens, 0),
       COALESCE(atb.output_tokens, 0),
       COALESCE(atb.estimated_cost_usd_micros, 0)
     FROM (SELECT 1) seed
     LEFT JOIN attestation_token_baselines atb
       ON atb.attestation_id = $1
     ON CONFLICT (consumer, attestation_id) DO NOTHING`,
    [
      params.attestationId,
      params.consumer.toLowerCase(),
      params.receiptId ?? null,
      params.accessType,
    ]
  );
}

function rangeToInterval(range: AnalyticsRange): string | null {
  if (range === "7d") return "7 days";
  if (range === "30d") return "30 days";
  if (range === "90d") return "90 days";
  return null;
}

function rangeFilter(column: string, range: AnalyticsRange, paramIndex: number): string {
  const interval = rangeToInterval(range);
  return interval ? ` AND ${column} >= NOW() - ($${paramIndex}::text)::interval` : "";
}

function rangeParams(range: AnalyticsRange): string[] {
  const interval = rangeToInterval(range);
  return interval ? [interval] : [];
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

export function parseAnalyticsRange(value: unknown): AnalyticsRange {
  return value === "7d" || value === "30d" || value === "90d" || value === "all"
    ? value
    : "30d";
}

export async function getUserAnalyticsSummary(
  owner: string,
  range: AnalyticsRange
): Promise<AnalyticsSummaryResponse> {
  const normalizedOwner = owner.toLowerCase();
  const params = rangeParams(range);
  const usageDateFilter = rangeFilter("created_at", range, 2);
  const reuseDateFilter = rangeFilter("dre.created_at", range, 2);
  const baselineDateFilter = rangeFilter("created_at", range, 2);

  const directResult = await pool.query<{
    calls: string;
    input_tokens: string;
    output_tokens: string;
    cost: string;
  }>(
    `SELECT
       COUNT(*)::bigint AS calls,
       COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
       COALESCE(SUM(estimated_cost_usd_micros), 0)::bigint AS cost
     FROM llm_usage_events
     WHERE owner = $1${usageDateFilter}`,
    [normalizedOwner, ...params]
  );

  const baselineResult = await pool.query<{ count: string; cost: string }>(
    `SELECT
       COUNT(*)::bigint AS count,
       COALESCE(SUM(estimated_cost_usd_micros), 0)::bigint AS cost
     FROM attestation_token_baselines
     WHERE owner = $1${baselineDateFilter}`,
    [normalizedOwner, ...params]
  );

  const reuseResult = await pool.query<{
    events: string;
    metered_events: string;
    input_tokens: string;
    output_tokens: string;
    avoided_cost: string;
    actual_cost: string;
  }>(
    `SELECT
       COUNT(*)::bigint AS events,
       COUNT(*) FILTER (WHERE dre.metered)::bigint AS metered_events,
       COALESCE(SUM(dre.avoided_input_tokens), 0)::bigint AS input_tokens,
       COALESCE(SUM(dre.avoided_output_tokens), 0)::bigint AS output_tokens,
       COALESCE(SUM(dre.avoided_cost_usd_micros), 0)::bigint AS avoided_cost,
       COALESCE(SUM(dre.actual_llm_cost_usd_micros), 0)::bigint AS actual_cost
     FROM data_reuse_events dre
     WHERE dre.consumer = $1${reuseDateFilter}`,
    [normalizedOwner, ...params]
  );

  const trendResult = await pool.query<{
    day: string;
    events: string;
    avoided_tokens: string;
    avoided_cost: string;
  }>(
    `SELECT
       to_char(date_trunc('day', dre.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
       COUNT(*)::bigint AS events,
       COALESCE(SUM(dre.avoided_input_tokens + dre.avoided_output_tokens), 0)::bigint AS avoided_tokens,
       COALESCE(SUM(dre.avoided_cost_usd_micros), 0)::bigint AS avoided_cost
     FROM data_reuse_events dre
     WHERE dre.consumer = $1${reuseDateFilter}
     GROUP BY 1
     ORDER BY 1 ASC`,
    [normalizedOwner, ...params]
  );

  const byModelResult = await pool.query<{
    model: string | null;
    events: string;
    avoided_tokens: string;
    avoided_cost: string;
  }>(
    `SELECT
       COALESCE(atb.model, 'unmetered') AS model,
       COUNT(*)::bigint AS events,
       COALESCE(SUM(dre.avoided_input_tokens + dre.avoided_output_tokens), 0)::bigint AS avoided_tokens,
       COALESCE(SUM(dre.avoided_cost_usd_micros), 0)::bigint AS avoided_cost
     FROM data_reuse_events dre
     LEFT JOIN attestation_token_baselines atb
       ON atb.attestation_id = dre.attestation_id
     WHERE dre.consumer = $1${reuseDateFilter}
     GROUP BY 1
     ORDER BY avoided_cost DESC, events DESC`,
    [normalizedOwner, ...params]
  );

  const recentResult = await pool.query<{
    attestation_id: string;
    title: string | null;
    domain: string | null;
    model: string | null;
    avoided_tokens: string;
    avoided_cost: string;
    reused_at: string;
  }>(
    `SELECT
       dre.attestation_id,
       NULLIF(a.metadata->>'title', '') AS title,
       NULLIF(a.metadata->>'domain', '') AS domain,
       COALESCE(atb.model, a.ai_model, 'unmetered') AS model,
       (dre.avoided_input_tokens + dre.avoided_output_tokens)::bigint AS avoided_tokens,
       dre.avoided_cost_usd_micros::bigint AS avoided_cost,
       dre.created_at AS reused_at
     FROM data_reuse_events dre
     LEFT JOIN attestations a
       ON a.attestation_id = dre.attestation_id
     LEFT JOIN attestation_token_baselines atb
       ON atb.attestation_id = dre.attestation_id
     WHERE dre.consumer = $1${reuseDateFilter}
     ORDER BY dre.created_at DESC
     LIMIT 5`,
    [normalizedOwner, ...params]
  );

  const direct = directResult.rows[0];
  const baseline = baselineResult.rows[0];
  const reuse = reuseResult.rows[0];
  const directCost = asNumber(direct.cost);
  const baselineCost = asNumber(baseline.cost);
  const avoidedCost = asNumber(reuse.avoided_cost);
  const actualReuseCost = asNumber(reuse.actual_cost);
  const uniqueReuseEvents = asNumber(reuse.events);
  const meteredEvents = asNumber(reuse.metered_events);

  return {
    range,
    summary: {
      directLlmCalls: asNumber(direct.calls),
      directInputTokens: asNumber(direct.input_tokens),
      directOutputTokens: asNumber(direct.output_tokens),
      directCostUsdMicros: directCost,
      baselineAttestations: asNumber(baseline.count),
      uniqueReuseEvents,
      avoidedInputTokens: asNumber(reuse.input_tokens),
      avoidedOutputTokens: asNumber(reuse.output_tokens),
      avoidedCostUsdMicros: avoidedCost,
      actualReuseLlmCostUsdMicros: actualReuseCost,
      netAvoidedLlmCostUsdMicros: avoidedCost - actualReuseCost,
      averageReuseEfficiency: baselineCost > 0 ? avoidedCost / baselineCost : 0,
      meteredReuseRatio: uniqueReuseEvents > 0 ? meteredEvents / uniqueReuseEvents : 0,
    },
    trend: trendResult.rows.map((row) => ({
      day: row.day,
      uniqueReuseEvents: asNumber(row.events),
      avoidedTokens: asNumber(row.avoided_tokens),
      avoidedCostUsdMicros: asNumber(row.avoided_cost),
    })),
    byModel: byModelResult.rows.map((row) => ({
      model: row.model || "unmetered",
      uniqueReuseEvents: asNumber(row.events),
      avoidedTokens: asNumber(row.avoided_tokens),
      avoidedCostUsdMicros: asNumber(row.avoided_cost),
    })),
    recentReuse: recentResult.rows.map((row) => ({
      attestationId: row.attestation_id,
      title: row.title || undefined,
      domain: row.domain || undefined,
      model: row.model || "unmetered",
      avoidedTokens: asNumber(row.avoided_tokens),
      avoidedCostUsdMicros: asNumber(row.avoided_cost),
      reusedAt: row.reused_at,
    })),
  };
}
