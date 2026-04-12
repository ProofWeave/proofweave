import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";

export const aiRouter = Router();

// Gemini 클라이언트 (lazy init)
let genaiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genaiClient) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    genaiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return genaiClient;
}

// 일일 rate limit (IP + API Key 기반, 10회/일)
const dailyUsage = new Map<string, { count: number; resetAt: number }>();
const DAILY_LIMIT = 10;

function checkDailyLimit(key: string): boolean {
  const now = Date.now();
  const entry = dailyUsage.get(key);

  if (!entry || now > entry.resetAt) {
    // 자정까지 리셋
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    dailyUsage.set(key, { count: 1, resetAt: tomorrow.getTime() });
    return true;
  }

  if (entry.count >= DAILY_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * POST /ai/analyze
 * Gemini 3 Flash로 분석 실행 후 결과 반환
 */
aiRouter.post("/ai/analyze", authenticate, async (req, res) => {
  const { prompt, model } = req.body;

  // 1. 입력 검증
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  if (prompt.length > 10_000) {
    res.status(400).json({ error: "prompt too long (max 10,000 chars)" });
    return;
  }

  // 2. Rate limit
  const rateLimitKey = req.body.walletAddress || req.ip || "unknown";
  if (!checkDailyLimit(rateLimitKey)) {
    res.status(429).json({
      error: "Daily analysis limit reached (10/day)",
      limit: DAILY_LIMIT,
    });
    return;
  }

  // 3. Gemini 호출
  try {
    const ai = getGenAI();
    const modelName = model || "gemini-2.0-flash";

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });

    const text = response.text ?? "";

    // 토큰 사용량 추출
    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    // 비용 추정 (Gemini Flash 기준)
    const inputCost = (inputTokens / 1_000_000) * 0.10;  // $0.10/1M
    const outputCost = (outputTokens / 1_000_000) * 0.40; // $0.40/1M
    const estimatedCost = +(inputCost + outputCost).toFixed(6);

    res.json({
      result: text,
      model: modelName,
      inputTokens,
      outputTokens,
      estimatedCost,
      dailyRemaining: (() => {
        const entry = dailyUsage.get(rateLimitKey);
        return entry ? DAILY_LIMIT - entry.count : DAILY_LIMIT;
      })(),
    });
  } catch (err: unknown) {
    console.error("[ai/analyze] Gemini error:", err);
    const message = err instanceof Error ? err.message : "Gemini API error";
    res.status(502).json({ error: message });
  }
});
