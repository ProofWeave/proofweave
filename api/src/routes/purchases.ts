import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { pool } from "../services/db.js";
import { EVM_TX_HASH_REGEX_SOURCE } from "../utils/tx.js";

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
         AND vault_receipt_ref IS NOT NULL
         AND vault_receipt_ref <> ''
         AND vault_tx_hash ~ $2
       ORDER BY attestation_id`,
      [payer, EVM_TX_HASH_REGEX_SOURCE]
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
         pl.vault_tx_hash AS tx_hash,
         pl.vault_receipt_ref,
         pl.created_at,
         ar.receipt_id
       FROM payments_ledger pl
       LEFT JOIN access_receipts ar ON ar.receipt_id = pl.receipt_id
       WHERE pl.payer = $1
         AND pl.vault_receipt_ref IS NOT NULL
         AND pl.vault_receipt_ref <> ''
         AND pl.vault_tx_hash ~ $2
       ORDER BY pl.created_at DESC
       LIMIT 50`,
      [payer, EVM_TX_HASH_REGEX_SOURCE]
    );
    res.json({
      purchases: result.rows.map((r: {
        attestation_id: string;
        amount_usd_micros: string;
        payment_method: string;
        tx_hash: string | null;
        vault_receipt_ref: string | null;
        created_at: string;
        receipt_id: string;
      }) => ({
        attestationId: r.attestation_id,
        amountUsd: (parseInt(r.amount_usd_micros) / 1_000_000).toFixed(6),
        amountUsdMicros: parseInt(r.amount_usd_micros),
        paymentMethod: r.payment_method,
        txHash: r.tx_hash,
        vaultReceiptRef: r.vault_receipt_ref,
        receiptId: r.receipt_id,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[purchases] History query failed:", err);
    res.status(500).json({ error: "Failed to fetch purchase history" });
  }
});
