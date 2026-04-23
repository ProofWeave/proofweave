import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { pool } from "../services/db.js";

export const purchasesRouter = Router();

/**
 * GET /purchases/mine
 * 내가 구매한 attestation ID 목록 (Explorer 뱃지용)
 */
purchasesRouter.get("/purchases/mine", authenticate, async (req, res) => {
  try {
    const payer = req.apiKeyOwner!.toLowerCase();
    const result = await pool.query(
      `SELECT DISTINCT attestation_id FROM access_receipts
       WHERE payer = $1
       ORDER BY attestation_id`,
      [payer]
    );
    res.json({
      attestationIds: result.rows.map((r: { attestation_id: string }) => r.attestation_id),
    });
  } catch (err) {
    console.error("[purchases] Mine query failed:", err);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

/**
 * GET /purchases/history
 * 구매 내역 (Settings 페이지용)
 */
purchasesRouter.get("/purchases/history", authenticate, async (req, res) => {
  try {
    const payer = req.apiKeyOwner!.toLowerCase();
    const result = await pool.query(
      `SELECT
         pl.attestation_id,
         pl.amount_usd_micros,
         pl.payment_method,
         pl.tx_hash,
         pl.created_at,
         ar.receipt_id
       FROM payments_ledger pl
       LEFT JOIN access_receipts ar ON ar.receipt_id = pl.receipt_id
       WHERE pl.payer = $1
       ORDER BY pl.created_at DESC
       LIMIT 50`,
      [payer]
    );
    res.json({
      purchases: result.rows.map((r: {
        attestation_id: string;
        amount_usd_micros: string;
        payment_method: string;
        tx_hash: string;
        created_at: string;
        receipt_id: string;
      }) => ({
        attestationId: r.attestation_id,
        amountUsd: (parseInt(r.amount_usd_micros) / 1_000_000).toFixed(6),
        amountUsdMicros: parseInt(r.amount_usd_micros),
        paymentMethod: r.payment_method,
        txHash: r.tx_hash,
        receiptId: r.receipt_id,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[purchases] History query failed:", err);
    res.status(500).json({ error: "Failed to fetch purchase history" });
  }
});
