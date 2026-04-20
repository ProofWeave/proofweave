import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { pool } from "../services/db.js";

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
