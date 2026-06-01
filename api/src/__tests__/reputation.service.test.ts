import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReputationError, getReputationSummary, submitReputation } from "../services/reputation.js";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../services/db.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

const ATTESTATION_ID = "attestation-1";
const CREATOR = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";

describe("reputation.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks paid artifact reputation without a vault-backed receipt", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ creator: CREATOR }] })
      .mockResolvedValueOnce({ rows: [{ price_usd_micros: "50000" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(submitReputation({
      attestationId: ATTESTATION_ID,
      accountAddress: BUYER,
      rating: "useful",
    })).rejects.toMatchObject(new ReputationError("UNPURCHASED", "paid artifact reputation requires a vault-backed receipt"));
  });

  it("blocks creator self-rating", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ creator: CREATOR }] });

    await expect(submitReputation({
      attestationId: ATTESTATION_ID,
      accountAddress: CREATOR,
      rating: "useful",
    })).rejects.toMatchObject(new ReputationError("SELF_RATING", "creator cannot rate their own attestation"));
  });

  it("records verified reputation for paid buyers with vault receipts", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ creator: CREATOR }] })
      .mockResolvedValueOnce({ rows: [{ price_usd_micros: "50000" }] })
      .mockResolvedValueOnce({ rows: [{ receipt_id: "018f0000-0000-7000-8000-000000000001" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "018f0000-0000-7000-8000-000000000002",
          attestation_id: ATTESTATION_ID,
          account_address: BUYER.toLowerCase(),
          receipt_id: "018f0000-0000-7000-8000-000000000001",
          rating: "useful",
          note: null,
          artifact_hash: null,
          trust_tier: "verified",
          created_at: "2026-05-25T00:00:00.000Z",
        }],
      });

    const result = await submitReputation({
      attestationId: ATTESTATION_ID,
      accountAddress: BUYER,
      receiptPayers: ["web:user@example.com", BUYER],
      rating: "useful",
    });

    expect(result.trustTier).toBe("verified");
    expect(result.receiptId).toBe("018f0000-0000-7000-8000-000000000001");
    expect(mockQuery.mock.calls[2][1]).toEqual([
      ATTESTATION_ID,
      [BUYER.toLowerCase(), "web:user@example.com"],
      "^0x[0-9a-fA-F]{64}$",
    ]);
  });

  it("returns verified and unverified aggregate ratios", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { trust_tier: "verified", rating: "useful", count: 3 },
        { trust_tier: "verified", rating: "not_useful", count: 1 },
        { trust_tier: "unverified", rating: "useful", count: 1 },
      ],
    });

    await expect(getReputationSummary(ATTESTATION_ID)).resolves.toEqual({
      attestationId: ATTESTATION_ID,
      verifiedUsefulRatio: 0.75,
      verifiedSampleSize: 4,
      unverifiedUsefulRatio: 1,
      unverifiedSampleSize: 1,
      earlyEvaluationStage: true,
    });
  });
});
