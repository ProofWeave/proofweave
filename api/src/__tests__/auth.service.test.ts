import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  parseSignatureMessage,
  isTimestampValid,
} from "../services/auth.js";

describe("auth.service", () => {
  describe("generateApiKey", () => {
    it("should start with pw_ prefix", () => {
      const key = generateApiKey();
      expect(key).toMatch(/^pw_/);
    });

    it("should have correct length (pw_ + 48 hex chars = 51)", () => {
      const key = generateApiKey();
      expect(key.length).toBe(51);
    });

    it("should generate unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it("should contain only hex chars after prefix", () => {
      const key = generateApiKey();
      const hexPart = key.slice(3);
      expect(hexPart).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  describe("hashApiKey", () => {
    it("should produce deterministic hash", () => {
      const key = "pw_test123";
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });

    it("should produce different hashes for different keys", () => {
      expect(hashApiKey("pw_aaa")).not.toBe(hashApiKey("pw_bbb"));
    });

    it("should return 64-char hex string (SHA-256)", () => {
      const hash = hashApiKey("pw_test");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("parseSignatureMessage", () => {
    const validMessage = [
      "ProofWeave API Key Request",
      "Address: 0x1234567890abcdef1234567890abcdef12345678",
      "Timestamp: 2026-04-12T03:00:00Z",
      "Action: register",
    ].join("\n");

    it("should parse valid message", () => {
      const result = parseSignatureMessage(validMessage);
      expect(result).toEqual({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        timestamp: "2026-04-12T03:00:00Z",
        action: "register",
      });
    });

    it("should return null for wrong header", () => {
      const msg = validMessage.replace("ProofWeave API Key Request", "Wrong");
      expect(parseSignatureMessage(msg)).toBeNull();
    });

    it("should return null for missing Address", () => {
      const msg = validMessage.replace("Address:", "Addr:");
      expect(parseSignatureMessage(msg)).toBeNull();
    });

    it("should return null for invalid action", () => {
      const msg = validMessage.replace("Action: register", "Action: delete");
      expect(parseSignatureMessage(msg)).toBeNull();
    });

    it("should parse rotate action", () => {
      const msg = validMessage.replace("Action: register", "Action: rotate");
      const result = parseSignatureMessage(msg);
      expect(result?.action).toBe("rotate");
    });
  });

  describe("isTimestampValid", () => {
    it("should accept recent timestamp", () => {
      const now = new Date().toISOString();
      expect(isTimestampValid(now)).toBe(true);
    });

    it("should reject timestamp older than 5 minutes", () => {
      const old = new Date(Date.now() - 6 * 60_000).toISOString();
      expect(isTimestampValid(old)).toBe(false);
    });

    it("should reject invalid date string", () => {
      expect(isTimestampValid("not-a-date")).toBe(false);
    });

    it("should accept timestamp within 5 minutes", () => {
      const recent = new Date(Date.now() - 4 * 60_000).toISOString();
      expect(isTimestampValid(recent)).toBe(true);
    });
  });
});
