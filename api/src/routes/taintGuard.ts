import { Router } from "express";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";

export const taintGuardRouter = Router();

taintGuardRouter.post("/taint/evaluate", authenticate, async (req, res) => {
  if (!env.TAINT_GUARD_URL) {
    res.status(503).json({ error: "TAINT_GUARD_URL is not configured" });
    return;
  }

  const { conversationId, history, currentPrompt } = req.body ?? {};

  if (!currentPrompt || typeof currentPrompt !== "string") {
    res.status(400).json({ error: "currentPrompt is required" });
    return;
  }

  const upstreamBody = {
    conversation_id:
      typeof conversationId === "string" && conversationId.trim().length > 0
        ? conversationId
        : `pw-${Date.now()}`,
    history: Array.isArray(history) ? history.filter((v): v is string => typeof v === "string") : [],
    current_prompt: currentPrompt,
  };

  try {
    const response = await fetch(`${env.TAINT_GUARD_URL}/evaluate-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamBody),
    });

    const rawText = await response.text();
    let payload: unknown = {};

    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = rawText ? { error: rawText } : {};
    }

    if (!response.ok) {
      res.status(response.status).json(payload);
      return;
    }

    res.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Prompt Guard request failed";
    res.status(502).json({ error: message });
  }
});
