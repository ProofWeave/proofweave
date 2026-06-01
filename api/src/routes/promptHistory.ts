import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { pool } from "../services/db.js";

export const promptHistoryRouter = Router();

export interface PromptHistoryInsert {
  owner: string;
  prompt: string;
  model?: string;
  result?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsdMicros?: number;
  llmUsageEventId?: string;
}

/** 프롬프트 기록 저장 — analyze 성공 시 호출. 실패는 삼켜서 분석 흐름을 막지 않는다. */
export async function recordPromptHistory(entry: PromptHistoryInsert): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO prompt_history
         (owner, prompt, model, result, input_tokens, output_tokens, estimated_cost_usd_micros, llm_usage_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.owner.toLowerCase(),
        entry.prompt,
        entry.model ?? null,
        entry.result ?? null,
        entry.inputTokens ?? 0,
        entry.outputTokens ?? 0,
        entry.estimatedCostUsdMicros ?? 0,
        entry.llmUsageEventId ?? null,
      ]
    );
  } catch (err) {
    console.error("[promptHistory] insert failed:", err);
  }
}

/** GET /prompt-history — 내 프롬프트 기록 (최신순) */
promptHistoryRouter.get("/prompt-history", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT id, prompt, model, result, input_tokens, output_tokens,
              estimated_cost_usd_micros, attestation_id, created_at
       FROM prompt_history
       WHERE owner = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [owner.toLowerCase()]
    );
    res.json({
      history: result.rows.map((r: {
        id: string;
        prompt: string;
        model: string | null;
        result: string | null;
        input_tokens: string;
        output_tokens: string;
        estimated_cost_usd_micros: string;
        attestation_id: string | null;
        created_at: string;
      }) => ({
        id: r.id,
        prompt: r.prompt,
        model: r.model,
        result: r.result,
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        estimatedCostUsdMicros: Number(r.estimated_cost_usd_micros),
        attestationId: r.attestation_id,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[promptHistory] query failed:", err);
    res.status(500).json({ error: "Failed to fetch prompt history" });
  }
});

/** DELETE /prompt-history/:id — 항목 삭제 (owner-scoped) */
promptHistoryRouter.delete("/prompt-history/:id", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    await pool.query(`DELETE FROM prompt_history WHERE id = $1 AND owner = $2`, [
      req.params.id,
      owner.toLowerCase(),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[promptHistory] delete failed:", err);
    res.status(500).json({ error: "Failed to delete prompt history entry" });
  }
});
