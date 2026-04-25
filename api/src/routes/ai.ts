import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";
import { recordLlmUsage, usdToMicros } from "../services/analytics.js";

export const aiRouter = Router();

// ── 지원 모델 목록 + 설정 ────────────────────────────────
interface ModelConfig {
  id: string;
  label: string;
  dailyLimit: number;
  tier: "free" | "pro";
  inputCostPer1M: number;   // $/1M tokens
  outputCostPer1M: number;
}

const SUPPORTED_MODELS: ModelConfig[] = [
  // ── Gemini 3.x (최신) ────────────────────────────────
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    dailyLimit: 3,
    tier: "pro",
    inputCostPer1M: 2.50,
    outputCostPer1M: 15.00,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    dailyLimit: 10,
    tier: "free",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    dailyLimit: 10,
    tier: "free",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
  },
  // ── Gemini 2.5 (Stable) ──────────────────────────────
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    dailyLimit: 10,
    tier: "free",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    dailyLimit: 3,
    tier: "pro",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    dailyLimit: 10,
    tier: "free",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
  },
];

const MODEL_MAP = new Map(SUPPORTED_MODELS.map((m) => [m.id, m]));

// ── Gemini 클라이언트 (lazy init) ────────────────────────
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

// ── 모델별 일일 한도 (사용자 × 모델) ─────────────────────
// key = `${userKey}:${modelId}`
const dailyUsage = new Map<string, { count: number; resetAt: number }>();

function checkModelLimit(userKey: string, modelId: string, limit: number): { allowed: boolean; remaining: number } {
  const compositeKey = `${userKey}:${modelId}`;
  const now = Date.now();
  const entry = dailyUsage.get(compositeKey);

  if (!entry || now > entry.resetAt) {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    dailyUsage.set(compositeKey, { count: 1, resetAt: tomorrow.getTime() });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

function getRemaining(userKey: string, modelId: string, limit: number): number {
  const compositeKey = `${userKey}:${modelId}`;
  const now = Date.now();
  const entry = dailyUsage.get(compositeKey);
  if (!entry || now > entry.resetAt) return limit;
  return Math.max(0, limit - entry.count);
}

// ── GET /ai/models — 사용 가능한 모델 목록 ────────────────
aiRouter.get("/ai/models", authenticate, (req, res) => {
  const userKey = req.apiKeyOwner || req.ip || "unknown";

  const models = SUPPORTED_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    tier: m.tier,
    dailyLimit: m.dailyLimit,
    remaining: getRemaining(userKey, m.id, m.dailyLimit),
  }));

  res.json({ models });
});

// ── POST /ai/analyze — 분석 실행 ──────────────────────────
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

  // 2. 모델 검증
  const modelId = model || "gemini-3-flash-preview";
  const modelConfig = MODEL_MAP.get(modelId);

  if (!modelConfig) {
    res.status(400).json({
      error: `Unsupported model: ${modelId}`,
      supported: SUPPORTED_MODELS.map((m) => m.id),
    });
    return;
  }

  // 3. 모델별 Rate limit
  const userKey = req.apiKeyOwner || req.ip || "unknown";
  const { allowed, remaining } = checkModelLimit(userKey, modelId, modelConfig.dailyLimit);

  if (!allowed) {
    res.status(429).json({
      error: `Daily limit reached for ${modelConfig.label} (${modelConfig.dailyLimit}/day)`,
      model: modelId,
      limit: modelConfig.dailyLimit,
      remaining: 0,
    });
    return;
  }

  // 4. Gemini 호출 (Google Search grounding 활성화)
  try {
    const ai = getGenAI();

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text ?? "";

    // 토큰 사용량
    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    // 비용 추정
    const inputCost = (inputTokens / 1_000_000) * modelConfig.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * modelConfig.outputCostPer1M;
    const estimatedCostUsdMicros = usdToMicros(inputCost + outputCost);
    const estimatedCost = estimatedCostUsdMicros / 1_000_000;

    let usageEventId: string | undefined;
    if (usage) {
      try {
        usageEventId = await recordLlmUsage({
          owner: userKey,
          provider: "google",
          model: modelId,
          inputTokens,
          outputTokens,
          estimatedCostUsdMicros,
        });
      } catch (analyticsErr) {
        console.error("[ai/analyze] Failed to record LLM usage:", analyticsErr);
      }
    }

    // Google Search grounding 메타데이터 추출
    const grounding = response.candidates?.[0]?.groundingMetadata;
    const sources = grounding?.groundingChunks
      ?.filter((c) => c.web)
      .map((c) => ({
        url: c.web?.uri,
        title: c.web?.title,
      })) ?? [];

    res.json({
      result: text,
      model: modelId,
      modelLabel: modelConfig.label,
      tier: modelConfig.tier,
      inputTokens,
      outputTokens,
      estimatedCost,
      usageEventId,
      remaining,
      dailyLimit: modelConfig.dailyLimit,
      sources,
    });
  } catch (err: unknown) {
    console.error("[ai/analyze] Gemini error:", err);
    const message = err instanceof Error ? err.message : "Gemini API error";
    res.status(502).json({ error: message });
  }
});
