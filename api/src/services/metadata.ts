import { GoogleGenAI } from "@google/genai";
import { pool } from "./db.js";
import { env } from "../config/env.js";
import { redactPII } from "./sanitize.js";
import { downloadIPFSPayload } from "./ipfs.js";
import { decryptData, decryptDataV2 } from "./crypto.js";

// ── Types ────────────────────────────────────────────────────

export interface AttestationMetadata {
  // 규칙 기반 (동기)
  aiModel: string;
  language: string;
  inputShape: string;
  outputShape: string;
  format: string;
  hasCode: boolean;
  sizeStats: { inputTokens?: number; outputTokens?: number };

  // LLM 기반 (비동기)
  title?: string;
  domain?: string;
  problemType?: string;
  keywords?: string[];
  abstract?: string;
  policyTags?: string[];
}

// ── 입력 정규화 ────────────────────────────────────────────

/**
 * 다양한 형태의 data 객체에서 prompt/result 텍스트를 정규화하여 추출
 *
 * 지원 형태:
 * - { prompt: "...", result: "..." } → 직접 사용
 * - { messages: [{role, content}] } → 대화 내용을 role: content로 조합
 * - { result: {...} } → JSON.stringify로 변환
 */
function normalizeDataTexts(data: Record<string, unknown>): {
  prompt: string;
  result: string;
} {
  let prompt = "";
  let result = "";

  // messages[] 배열 처리 (대화형 payload)
  if (Array.isArray(data.messages)) {
    const msgs = data.messages as Array<{ role?: string; content?: unknown }>;
    const parts = msgs.map((m) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content ?? "");
      return `${m.role || "unknown"}: ${content}`;
    });
    // 마지막 assistant 응답을 result로, 나머지를 prompt로
    let lastAssistantIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if ((msgs[i].role || "").toLowerCase() === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx >= 0) {
      prompt = parts.slice(0, lastAssistantIdx).join("\n");
      result = parts.slice(lastAssistantIdx).join("\n");
    } else {
      prompt = parts.join("\n");
    }
  } else {
    // prompt 추출
    prompt =
      typeof data.prompt === "string"
        ? data.prompt
        : typeof data.prompt === "object" && data.prompt !== null
          ? JSON.stringify(data.prompt)
          : "";

    // result 추출 (object → stringify, 문자열 → 그대로)
    result =
      typeof data.result === "string"
        ? data.result
        : typeof data.result === "object" && data.result !== null
          ? JSON.stringify(data.result)
          : "";
  }

  return { prompt, result };
}

// ── 규칙 기반 추출 (동기, 실패 없음) ────────────────────────

/** 규칙 기반 메타데이터 추출 — 비용 0, 동기, 실패 불가 */
export function extractRuleMetadata(
  data: Record<string, unknown>,
  aiModel: string
): AttestationMetadata {
  const { prompt, result } = normalizeDataTexts(data);
  const combined = prompt + result;

  return {
    aiModel,
    language: detectLanguage(combined),
    inputShape: detectShape(prompt),
    outputShape: detectShape(result),
    format: detectFormat(data),
    hasCode: combined.includes("```"),
    sizeStats: {
      inputTokens:
        typeof data.inputTokens === "number" ? data.inputTokens : undefined,
      outputTokens:
        typeof data.outputTokens === "number" ? data.outputTokens : undefined,
    },
  };
}

// ── LLM 기반 보강 (비동기) ─────────────────────────────────

/** Gemini Flash-Lite로 의미 기반 메타데이터 보강 (fire-and-forget) */
export async function enrichWithLLM(
  attestationId: string,
  data: Record<string, unknown>,
  aiModel: string
): Promise<void> {
  const geminiKey = env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn("[metadata] GEMINI_API_KEY not set — skipping LLM enrichment");
    await markFailed(attestationId);
    return;
  }

  const { prompt, result } = normalizeDataTexts(data);

  // 1. PII 제거
  const cleanPrompt = redactPII(prompt);
  const cleanResult = redactPII(result);

  // 2. 샘플링 (앞500 + 뒤500)
  const sampledResult = sampleText(cleanResult, 500, 500);

  // 3. Gemini Flash-Lite 호출
  const llmResult = await callGeminiForMetadata(
    geminiKey,
    cleanPrompt,
    sampledResult,
    aiModel
  );

  if (!llmResult) {
    await markFailed(attestationId);
    return;
  }

  // 4. DB 업데이트 (detectedPII는 metadata에 함께 저장)
  const metadataToStore = {
    title: llmResult.title,
    domain: llmResult.domain,
    problemType: llmResult.problemType,
    abstract: llmResult.abstract,
    policyTags: llmResult.policyTags,
    detectedPII: llmResult.detectedPII || [],
  };

  await pool.query(
    `UPDATE attestations 
     SET metadata = metadata || $2::jsonb,
         keywords = $3,
         metadata_status = 'ready'
     WHERE attestation_id = $1`,
    [attestationId, JSON.stringify(metadataToStore), llmResult.keywords || []]
  );

  const piiCount = llmResult.detectedPII?.length || 0;
  console.log(
    `[metadata] enriched ${attestationId}: ${llmResult.title} [${llmResult.domain}]` +
    (piiCount > 0 ? ` ⚠️ ${piiCount} PII detected` : "")
  );
}

// ── Gemini 호출 ────────────────────────────────────────────

const METADATA_PROMPT = `AI 대화 데이터의 메타데이터를 JSON으로 추출해.

규칙:
1. title: 고유명사(회사명, 프로토콜명)를 일반 카테고리로 치환.
   ❌ "Uniswap V3 TWAP 분석" → ✅ "DeFi 프로토콜 가격 오라클 보안 분석"
2. abstract: 최대 2문장. "이 데이터가 다루는 문제"만 설명.
   결론, 핵심 인사이트, 구체 수치, 해결책은 절대 포함하지 마.
3. keywords: 기술 용어 위주 최대 15개. 소문자.
4. domain: defi/smart_contract/nft/dao/infrastructure/general 중 하나.
5. problemType: security_analysis/code_review/summarization/translation/
   data_analysis/code_generation/general 중 하나.
6. policyTags: 감지된 항목만. no_pii/contains_pii/has_code/
   financial_data/public_data 중 해당 항목.
7. detectedPII: 텍스트에서 발견된 개인정보를 배열로 반환.
   감지 대상: 사람 이름, 기관명, 계좌번호, 주민등록번호, 여권번호,
   물리적 주소, 내부 프로젝트 코드명 등 개인/조직 식별 가능한 정보 등.
   각 항목은 {"type": "person_name"|"org_name"|"account"|"id_number"|"address"|"other", "value": "원본텍스트"} 형식.
   PII가 없으면 빈 배열 [].

JSON만 반환:
{"title","domain","problemType","keywords","abstract","policyTags","detectedPII"}`;

async function callGeminiForMetadata(
  apiKey: string,
  cleanPrompt: string,
  sampledResult: string,
  aiModel: string
): Promise<{
  title: string;
  domain: string;
  problemType: string;
  keywords: string[];
  abstract: string;
  policyTags: string[];
  detectedPII: Array<{ type: string; value: string }>;
} | null> {
  // 우선순위 모델 + 폴백
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  for (const modelId of models) {
    try {
      const genai = new GoogleGenAI({ apiKey });

      const userContent = `${METADATA_PROMPT}

입력:
prompt: ${cleanPrompt.slice(0, 1000)}
result 샘플: ${sampledResult.slice(0, 1200)}
model: ${aiModel}`;

      const response = await genai.models.generateContent({
        model: modelId,
        contents: userContent,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        console.warn(`[metadata] ${modelId} returned empty response — trying next`);
        continue;
      }

      const parsed = JSON.parse(text);

      // 기본 검증
      if (!parsed.title || !parsed.domain) {
        console.warn(`[metadata] ${modelId} result missing required fields:`, text.slice(0, 200));
        continue;
      }

      // keywords 정규화: 소문자, 최대 15개
      if (Array.isArray(parsed.keywords)) {
        parsed.keywords = parsed.keywords
          .map((k: unknown) => String(k).toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 15);
      }

      console.log(`[metadata] success with ${modelId}`);
      return parsed;
    } catch (err) {
      console.warn(
        `[metadata] ${modelId} failed:`,
        err instanceof Error ? err.message : err
      );
      // 다음 모델로 폴백
    }
  }

  console.error("[metadata] All models failed for metadata extraction");
  return null;
}

// ── 내부 헬퍼 ──────────────────────────────────────────────

function sampleText(
  text: string,
  headChars: number,
  tailChars: number
): string {
  if (text.length <= headChars + tailChars) return text;
  return `${text.slice(0, headChars)}\n[...중략...]\n${text.slice(-tailChars)}`;
}

function detectLanguage(text: string): string {
  const koChars = (text.match(/[가-힣]/g) || []).length;
  const ratio = koChars / Math.max(text.length, 1);
  if (ratio > 0.3) return "ko";
  if (ratio > 0.05) return "mixed";
  return "en";
}

function detectShape(text: string): string {
  if (!text) return "empty";
  try {
    JSON.parse(text);
    return "json";
  } catch {
    // not JSON
  }
  if (/```[\s\S]*```/.test(text)) return "code_with_text";
  if (text.length > 2000) return "long_form";
  return "free_text";
}

function detectFormat(data: Record<string, unknown>): string {
  if (Array.isArray(data.messages)) return "conversation";
  if (data.result && typeof data.result === "object") return "structured_json";
  return "report";
}

/**
 * metadata_status = 'failed' 또는 잘못 채워진 항목을 IPFS에서 원본 데이터를 복호화하여 재시도
 */
export async function retryFailedMetadata(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT attestation_id, ai_model, offchain_ref, encryption_salt,
              encryption_version, content_hash
       FROM attestations
       WHERE metadata_status = 'failed'
          OR (metadata_status = 'ready'
              AND (metadata->>'title' ILIKE '%접근%오류%' OR metadata->>'title' ILIKE '%retry%'))
       ORDER BY created_at DESC LIMIT 20`
    );

    if (result.rows.length === 0) return;

    console.log(`[metadata] Retrying ${result.rows.length} failed enrichments with real data...`);
    const encryptionKey = env.DATA_ENCRYPTION_KEY;
    if (!encryptionKey) {
      console.warn("[metadata] DATA_ENCRYPTION_KEY not set — cannot retry");
      return;
    }

    for (const row of result.rows) {
      try {
        // 1. IPFS에서 암호화된 페이로드 다운로드
        const ipfsData = await downloadIPFSPayload(row.offchain_ref);

        // 2. 복호화
        let plaintext: string;
        const encVer: number = row.encryption_version ?? 1;

        if (encVer === 2 && ipfsData.version === 2) {
          plaintext = decryptDataV2(ipfsData.encrypted, ipfsData.wrappedDEK, encryptionKey);
        } else {
          const salt: string = row.encryption_salt ?? row.content_hash;
          plaintext = decryptData(ipfsData.encrypted, encryptionKey, salt);
        }

        const data = JSON.parse(plaintext) as Record<string, unknown>;

        // 3. pending 마킹 후 실제 데이터로 재보강
        await pool.query(
          `UPDATE attestations SET metadata_status = 'pending' WHERE attestation_id = $1`,
          [row.attestation_id]
        );

        enrichWithLLM(row.attestation_id, data, row.ai_model).catch(() => {});
      } catch (innerErr) {
        console.warn(
          `[metadata] retry skip ${row.attestation_id}:`,
          innerErr instanceof Error ? innerErr.message : innerErr
        );
      }
    }
  } catch (err) {
    console.warn("[metadata] Failed to retry metadata:", err instanceof Error ? err.message : err);
  }
}


async function markFailed(attestationId: string): Promise<void> {
  await pool
    .query(
      `UPDATE attestations SET metadata_status = 'failed' WHERE attestation_id = $1`,
      [attestationId]
    )
    .catch(() => { });
}
