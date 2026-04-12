import { describe, it, expect } from "vitest";
import {
  canonicalHash,
  deriveKey,
  encryptData,
  decryptData,
} from "../services/crypto.js";

const TEST_MASTER_KEY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("crypto.ts", () => {
  describe("canonicalHash", () => {
    it("동일 데이터 → 동일 해시 (결정적)", () => {
      const data = { b: 2, a: 1, c: 3 };
      const hash1 = canonicalHash(data);
      const hash2 = canonicalHash(data);
      expect(hash1).toBe(hash2);
    });

    it("키 순서 무관 → 동일 해시", () => {
      const hash1 = canonicalHash({ name: "test", value: 42 });
      const hash2 = canonicalHash({ value: 42, name: "test" });
      expect(hash1).toBe(hash2);
    });

    it("다른 데이터 → 다른 해시", () => {
      const hash1 = canonicalHash({ a: 1 });
      const hash2 = canonicalHash({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it("0x 접두사 + 64자 hex 형식", () => {
      const hash = canonicalHash({ test: true });
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe("deriveKey", () => {
    it("32바이트 Buffer 반환", () => {
      const key = deriveKey(TEST_MASTER_KEY, "test-attestation-id");
      expect(key.length).toBe(32);
    });

    it("같은 attestationId → 같은 키", () => {
      const key1 = deriveKey(TEST_MASTER_KEY, "attest-001");
      const key2 = deriveKey(TEST_MASTER_KEY, "attest-001");
      expect(key1.equals(key2)).toBe(true);
    });

    it("다른 attestationId → 다른 키", () => {
      const key1 = deriveKey(TEST_MASTER_KEY, "attest-001");
      const key2 = deriveKey(TEST_MASTER_KEY, "attest-002");
      expect(key1.equals(key2)).toBe(false);
    });

    it("다른 마스터 키 → 다른 파생 키", () => {
      const master2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      const key1 = deriveKey(TEST_MASTER_KEY, "attest-001");
      const key2 = deriveKey(master2, "attest-001");
      expect(key1.equals(key2)).toBe(false);
    });

    it("잘못된 키 길이 → 에러", () => {
      expect(() => deriveKey("tooshort", "test")).toThrow("32 bytes");
    });
  });

  describe("encryptData / decryptData", () => {
    it("암호화 → 복호화 라운드트립", () => {
      const plaintext = JSON.stringify({ analysis: "vulnerability found", severity: "high" });
      const attestationId = "test-attest-123";

      const encrypted = encryptData(plaintext, TEST_MASTER_KEY, attestationId);
      const decrypted = decryptData(encrypted, TEST_MASTER_KEY, attestationId);

      expect(decrypted).toBe(plaintext);
    });

    it("암호문은 평문과 다름", () => {
      const plaintext = "sensitive data";
      const encrypted = encryptData(plaintext, TEST_MASTER_KEY, "test-id");

      expect(encrypted.ciphertext).not.toBe(plaintext);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();
    });

    it("다른 attestationId로 복호화 실패", () => {
      const encrypted = encryptData("secret", TEST_MASTER_KEY, "attest-001");

      expect(() => {
        decryptData(encrypted, TEST_MASTER_KEY, "attest-002");
      }).toThrow();
    });

    it("다른 마스터 키로 복호화 실패", () => {
      const master2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      const encrypted = encryptData("secret", TEST_MASTER_KEY, "attest-001");

      expect(() => {
        decryptData(encrypted, master2, "attest-001");
      }).toThrow();
    });

    it("변조된 ciphertext → 인증 실패", () => {
      const encrypted = encryptData("secret", TEST_MASTER_KEY, "test-id");
      const tampered = { ...encrypted, ciphertext: "dGFtcGVyZWQ=" }; // "tampered" in base64

      expect(() => {
        decryptData(tampered, TEST_MASTER_KEY, "test-id");
      }).toThrow();
    });

    it("동일 데이터를 두 번 암호화 → 다른 암호문 (랜덤 IV)", () => {
      const encrypted1 = encryptData("same data", TEST_MASTER_KEY, "test-id");
      const encrypted2 = encryptData("same data", TEST_MASTER_KEY, "test-id");

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it("한글/이모지 지원", () => {
      const plaintext = "보안 분석 결과 🔒: 취약점 발견";
      const encrypted = encryptData(plaintext, TEST_MASTER_KEY, "test-id");
      const decrypted = decryptData(encrypted, TEST_MASTER_KEY, "test-id");

      expect(decrypted).toBe(plaintext);
    });
  });
});
