import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { pool } from "../services/db.js";
import {
  getUserAnalyticsSummary,
  parseAnalyticsRange,
} from "../services/analytics.js";

export const statsRouter = Router();

/**
 * GET /stats/me — 내 통계 (인증 필요)
 *
 * 유저 개인의 구매 건수, 총 지출, 등록 건수, 절감액 추정치를 반환.
 */
statsRouter.get("/stats/me", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    // 1. 내 구매 건수 (access_receipts)
    const purchasesResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM access_receipts WHERE payer = $1`,
      [owner.toLowerCase()]
    );
    const totalPurchases = purchasesResult.rows[0]?.count || 0;

    // 2. 내 총 지출 (payments_ledger)
    const spentResult = await pool.query(
      `SELECT COALESCE(SUM(amount_usd_micros), 0)::bigint AS total FROM payments_ledger WHERE payer = $1`,
      [owner.toLowerCase()]
    );
    const totalSpentUsdMicros = Number(spentResult.rows[0]?.total || 0);

    // 3. 내 등록 건수 (attestations)
    const attestResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM attestations WHERE creator = $1`,
      [owner.toLowerCase()]
    );
    const totalAttestations = attestResult.rows[0]?.count || 0;

    // 4. 절감액 추정 (직접 AI 호출 대비)
    //    가정: 직접 호출 시 건당 ~$0.05, ProofWeave 통해 건당 ~$0.01
    const estimatedSavingsUsdMicros = totalPurchases * (50_000 - 10_000); // $0.04/건 절감

    res.json({
      totalPurchases,
      totalSpentUsdMicros,
      totalSpentUsd: (totalSpentUsdMicros / 1_000_000).toFixed(6),
      totalAttestations,
      estimatedSavingsUsdMicros,
      estimatedSavingsUsd: (estimatedSavingsUsdMicros / 1_000_000).toFixed(4),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[stats] Error:", errMsg);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * GET /stats/analytics/me?range=30d — 실제 토큰 절감 기반 Analytics
 */
statsRouter.get("/stats/analytics/me", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const range = parseAnalyticsRange(req.query.range);

  try {
    const analytics = await getUserAnalyticsSummary(owner, range);
    res.json(analytics);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[stats/analytics] Error:", errMsg);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

/**
 * GET /stats/timeline?days=30 — 도메인별 일자 집계 (공개)
 *
 * 지정한 기간 동안 각 날짜별로 domain → count 맵을 반환.
 * 메타데이터가 없거나 domain이 비어있으면 'unknown' 으로 집계.
 */
statsRouter.get("/stats/timeline", async (req, res) => {
  const rawDays = Number(req.query.days);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.floor(rawDays), 1), 90) : 30;

  try {
    const result = await pool.query<{ day: string; domain: string | null; count: string }>(
      `
      SELECT
        to_char(date_trunc('day', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        COALESCE(NULLIF(metadata->>'domain', ''), 'unknown') AS domain,
        COUNT(*)::bigint AS count
      FROM attestations
      WHERE created_at >= NOW() - ($1::int || ' days')::interval
      GROUP BY 1, 2
      ORDER BY 1 ASC
      `,
      [days]
    );

    const buckets: Record<string, Record<string, number>> = {};
    for (const row of result.rows) {
      const dom = row.domain || "unknown";
      if (!buckets[row.day]) buckets[row.day] = {};
      buckets[row.day][dom] = Number(row.count);
    }

    res.json({ days, buckets });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[stats/timeline] Error:", errMsg);
    res.status(500).json({ error: "Failed to fetch timeline" });
  }
});
