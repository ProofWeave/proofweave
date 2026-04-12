import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { signReceipt } from "../services/receipt.js";

// ── DB Mock ─────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};
mockConnect.mockResolvedValue(mockClient);

vi.mock("../services/db.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "development",
    CDP_API_KEY_ID: undefined,
    RECEIPT_SECRET: undefined,
  },
}));

vi.mock("../config/chain.js", () => ({
  operatorAccount: { address: "0xOperator" },
}));

vi.mock("../services/wallet.js", () => ({
  getSmartWalletAddress: vi.fn().mockResolvedValue(null),
  getWalletBalance: vi.fn().mockResolvedValue({ balanceUsdMicros: 0 }),
  transferUsdcFromSmartWallet: vi.fn().mockResolvedValue("dev-tx-123"),
}));

describe("x402Gate (Phase 2-4)", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonFn: ReturnType<typeof vi.fn>;
  let statusFn: ReturnType<typeof vi.fn>;
  let setHeaderFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    jsonFn = vi.fn();
    setHeaderFn = vi.fn();
    statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    mockNext = vi.fn();
    mockReq = {
      params: { id: "test-attest-001" },
      apiKeyOwner: "0xPayer123",
      headers: {},
      originalUrl: "/attestations/test-attest-001/detail",
    };
    mockRes = {
      status: statusFn,
      setHeader: setHeaderFn,
      json: jsonFn,
    } as unknown as Partial<Response>;
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("attestationId 없으면 400", async () => {
    mockReq.params = {};
    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it("인증 없으면 401", async () => {
    mockReq.apiKeyOwner = undefined;
    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);
    expect(statusFn).toHaveBeenCalledWith(401);
  });

  it("유효한 X-ACCESS-RECEIPT → 바로 통과", async () => {
    const receiptId = "test-receipt-001";
    const payer = "0xpayer123";
    const attestationId = "test-attest-001";
    const hmac = signReceipt(receiptId, attestationId, payer);

    mockReq.apiKeyOwner = payer;
    mockReq.headers = { "x-access-receipt": `${receiptId}.${hmac}` };

    // DB에서 receipt 존재 확인
    mockQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("유효한 서버 내부 receipt → 통과", async () => {
    // X-ACCESS-RECEIPT 없음 → 서버 내부 조회
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          receipt_id: "existing-receipt",
          attestation_id: "test-attest-001",
          payer: "0xpayer123",
          payment_method: "x402",
          tx_hash: null,
          amount_usd_micros: 50000,
          hmac: "existing-hmac",
          paid_at: new Date().toISOString(),
          expires_at: null,
        },
      ],
    });

    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("가격 없으면(무료) → 통과", async () => {
    // hasValidReceipt → null
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // getPrice → null
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("유료 + 결제 수단 없음 → 402 + quoteId", async () => {
    // hasValidReceipt → null
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // getPrice → 유료
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          attestation_id: "test-attest-001",
          creator_address: "0xCreator",
          price_usd_micros: 50000,
          currency: "USDC",
          network: "eip155:84532",
        },
      ],
    });
    // issueQuote → 기존 quote 없음
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // issueQuote → INSERT
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);
    expect(statusFn).toHaveBeenCalledWith(402);
    const responseBody = jsonFn.mock.calls[0][0];
    expect(responseBody.quoteId).toBeDefined();
    expect(responseBody["x-402"]).toBe(true);
  });
});
