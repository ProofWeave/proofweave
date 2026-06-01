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

const mockGetSmartWalletAddress = vi.hoisted(() => vi.fn());
const mockGetWalletBalance = vi.hoisted(() => vi.fn());
const mockDepositUsdcToVault = vi.hoisted(() => vi.fn());

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
    RECEIPT_SECRET: "test-receipt-secret-32-characters",
    PROXY_ADDRESS: "0x0000000000000000000000000000000000000001",
    VAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
  },
}));

vi.mock("../config/chain.js", () => ({
  operatorAccount: { address: "0xOperator" },
}));

vi.mock("../services/wallet.js", () => ({
  getSmartWalletAddress: (...args: unknown[]) => mockGetSmartWalletAddress(...args),
  getWalletBalance: (...args: unknown[]) => mockGetWalletBalance(...args),
  depositUsdcToVaultFromSmartWallet: (...args: unknown[]) => mockDepositUsdcToVault(...args),
  transferUsdcFromSmartWallet: vi.fn().mockResolvedValue("dev-tx-123"),
}));

const SMART_WALLET = "0x1111111111111111111111111111111111111111";
const CREATOR = "0x4444444444444444444444444444444444444444";
const VALID_TX_HASH = `0x${"c".repeat(64)}`;

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
    mockGetSmartWalletAddress.mockResolvedValue(null);
    mockGetWalletBalance.mockResolvedValue({ balanceUsdMicros: 0 });
    mockDepositUsdcToVault.mockResolvedValue(VALID_TX_HASH);
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
          payment_method: "smart-wallet",
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

  it("development 환경이어도 잔고 부족이면 결제 처리하지 않고 402", async () => {
    mockGetSmartWalletAddress.mockResolvedValue(SMART_WALLET);
    mockGetWalletBalance.mockResolvedValue({ balanceUsdMicros: 0 });
    // hasValidReceipt → null
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // getPrice → 유료
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          attestation_id: "test-attest-001",
          creator_address: CREATOR,
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
    expect(mockDepositUsdcToVault).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("vault deposit이 실제 EVM tx hash를 반환하지 않으면 receipt/ledger를 만들지 않고 502", async () => {
    mockGetSmartWalletAddress.mockResolvedValue(SMART_WALLET);
    mockGetWalletBalance.mockResolvedValue({ balanceUsdMicros: 100000 });
    mockDepositUsdcToVault.mockResolvedValue("dev-vault-tx-123");
    // hasValidReceipt → null
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // getPrice → 유료
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          attestation_id: "test-attest-001",
          creator_address: CREATOR,
          price_usd_micros: 50000,
          currency: "USDC",
          network: "eip155:84532",
        },
      ],
    });
    // findReceiptByVaultRef → 없음
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);

    expect(statusFn).toHaveBeenCalledWith(502);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("유료 + 잔고 충분 + 실제 vault tx → receipt 발급 후 통과", async () => {
    mockGetSmartWalletAddress.mockResolvedValue(SMART_WALLET);
    mockGetWalletBalance.mockResolvedValue({ balanceUsdMicros: 100000 });
    mockDepositUsdcToVault.mockResolvedValue(VALID_TX_HASH);
    // hasValidReceipt → null
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // getPrice → 유료
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          attestation_id: "test-attest-001",
          creator_address: CREATOR,
          price_usd_micros: 50000,
          currency: "USDC",
          network: "eip155:84532",
        },
      ],
    });
    // findReceiptByVaultRef → 없음
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { x402Gate } = await import("../middleware/x402Gate.js");
    await x402Gate(mockReq as Request, mockRes as Response, mockNext);

    expect(mockDepositUsdcToVault).toHaveBeenCalledOnce();
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(setHeaderFn).toHaveBeenCalledWith(
      "X-Access-Receipt",
      expect.stringMatching(/^[^.]+\.[0-9a-f]{64}$/)
    );
    expect(mockNext).toHaveBeenCalled();
  });
});
