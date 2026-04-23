import { createHmac } from "crypto";
import { env } from "../config/env.js";

/**
 * HMAC 기반 pseudonym 생성 (서버 비밀키 없이 역추적 불가)
 *
 * web: 접두사 사용자만 pseudonymize — CLI/지갑 사용자는 그대로 반환
 */
export function pseudonymize(identity: string): string {
  if (!identity.startsWith("web:")) return identity;
  const email = identity.slice(4);
  const hmac = createHmac("sha256", env.RECEIPT_SECRET)
    .update(email)
    .digest("hex")
    .slice(0, 12);
  return `seller-${hmac}`;
}

/**
 * 텍스트에서 PII 제거 (LLM 전송 전 1차 필터링)
 *
 * 마스킹 대상: 이메일, 지갑 주소, tx hash, 전화번호, 주민등록번호
 * 자연어 PII(이름, 기관명 등)는 Gemini가 detectedPII로 2차 감지
 */
export function redactPII(text: string): string {
  return text
    // 순서 중요: 긴 패턴부터 치환 (64바이트 hash → 40바이트 address)
    .replace(/0x[0-9a-fA-F]{64}/g, "[HASH]")
    .replace(/0x[0-9a-fA-F]{40}/g, "[ADDRESS]")
    // 이메일: plus-addressing, 서브도메인 지원 + 전각 @ 처리
    .replace(/[\w.+-]+[@＠][\w.-]+\.\w{2,}/g, "[EMAIL]")
    .replace(/\b\d{6}[-\s]?\d{7}\b/g, "[RRN]")
    .replace(/\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, "[PHONE]");
}
