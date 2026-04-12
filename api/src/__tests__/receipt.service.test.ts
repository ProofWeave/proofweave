import { describe, it, expect } from "vitest";
import { signReceipt, verifyHmac, parseReceiptHeader } from "../services/receipt.js";

describe("receipt.service (Phase 2-4 HMAC + UUID v7)", () => {
  const receiptId = "019527c8-1234-7000-8000-000000000001";
  const attestationId = "test-attest-001";
  const payer = "0x1234567890abcdef1234567890abcdef12345678";

  // ── HMAC 서명 ────────────────────────────────────────────

  describe("signReceipt", () => {
    it("동일 입력 → 동일 HMAC 생성", () => {
      const hmac1 = signReceipt(receiptId, attestationId, payer);
      const hmac2 = signReceipt(receiptId, attestationId, payer);
      expect(hmac1).toBe(hmac2);
      expect(hmac1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it("다른 입력 → 다른 HMAC 생성", () => {
      const hmac1 = signReceipt(receiptId, attestationId, payer);
      const hmac2 = signReceipt(receiptId, "different-attest", payer);
      expect(hmac1).not.toBe(hmac2);
    });

    it("payer 대소문자 무시 (lowercase 정규화)", () => {
      const hmac1 = signReceipt(receiptId, attestationId, payer.toUpperCase());
      const hmac2 = signReceipt(receiptId, attestationId, payer.toLowerCase());
      expect(hmac1).toBe(hmac2);
    });
  });

  // ── HMAC 검증 ────────────────────────────────────────────

  describe("verifyHmac", () => {
    it("올바른 HMAC → true", () => {
      const hmac = signReceipt(receiptId, attestationId, payer);
      expect(verifyHmac(receiptId, attestationId, payer, hmac)).toBe(true);
    });

    it("위조된 HMAC → false", () => {
      expect(
        verifyHmac(receiptId, attestationId, payer, "fakefakefake")
      ).toBe(false);
    });

    it("payer 불일치 → false", () => {
      const hmac = signReceipt(receiptId, attestationId, payer);
      expect(
        verifyHmac(receiptId, attestationId, "0xdifferent", hmac)
      ).toBe(false);
    });

    it("attestationId 불일치 → false", () => {
      const hmac = signReceipt(receiptId, attestationId, payer);
      expect(
        verifyHmac(receiptId, "wrong-attest", payer, hmac)
      ).toBe(false);
    });
  });

  // ── X-ACCESS-RECEIPT 파싱 ─────────────────────────────────

  describe("parseReceiptHeader", () => {
    it("정상 형식 파싱", () => {
      const hmac = signReceipt(receiptId, attestationId, payer);
      const header = `${receiptId}.${hmac}`;
      const parsed = parseReceiptHeader(header);
      expect(parsed).toEqual({ receiptId, hmac });
    });

    it("점(.)이 없으면 null", () => {
      expect(parseReceiptHeader("no-dot-here")).toBeNull();
    });

    it("빈 문자열 → null", () => {
      expect(parseReceiptHeader("")).toBeNull();
    });

    it("receiptId만 있고 hmac 없으면 null", () => {
      expect(parseReceiptHeader("receipt-id.")).toBeNull();
    });

    it("hmac에 점이 포함되어도 첫 번째 점으로 분리", () => {
      const result = parseReceiptHeader("id.hmac.extra");
      expect(result).toEqual({ receiptId: "id", hmac: "hmac.extra" });
    });
  });
});
