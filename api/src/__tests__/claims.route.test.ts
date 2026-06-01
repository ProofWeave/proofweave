import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";

// ── Mocks (route 의존성) ─────────────────────────────────────
vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    CDP_API_KEY_ID: "test-cdp",
    VAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
    PROXY_ADDRESS: "0x0000000000000000000000000000000000000001",
    USDC_CONTRACT_ADDRESS: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
}));

vi.mock("../services/auth.js", () => ({
  verifyApiKey: vi.fn(),
}));

const mockPoolQuery = vi.fn();
vi.mock("../services/db.js", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

vi.mock("../services/wallet.js", () => ({
  claimFromSmartWallet: vi.fn(),
}));

const mockClaimableBalance = vi.fn();
vi.mock("../contracts/attestationRegistry.js", () => ({
  vaultRead: { read: { claimableBalance: (...args: unknown[]) => mockClaimableBalance(...args) } },
}));

import { verifyApiKey } from "../services/auth.js";
import { claimFromSmartWallet } from "../services/wallet.js";
import { claimsRouter } from "../routes/claims.js";

const mockVerifyApiKey = vi.mocked(verifyApiKey);
const mockClaim = vi.mocked(claimFromSmartWallet);

const WEB_SMART = "0x1111111111111111111111111111111111111111";
const CLI_EOA = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const CLAIM_TX = `0x${"a".repeat(64)}`;
const CLAIM_TX_2 = `0x${"b".repeat(64)}`;

// auth 헬퍼: API key별로 web/CLI 유저 시뮬레이트
function asWebUser() {
  mockVerifyApiKey.mockResolvedValue({
    walletAddress: "web:creator@example.com",
    smartWalletAddress: WEB_SMART,
    eoaAddress: "0x9999999999999999999999999999999999999999",
  });
}
function asWebUserNoWallet() {
  mockVerifyApiKey.mockResolvedValue({
    walletAddress: "web:nowallet@example.com",
    smartWalletAddress: null,
    eoaAddress: null,
  });
}
function asCliUser() {
  mockVerifyApiKey.mockResolvedValue({
    walletAddress: CLI_EOA,
    smartWalletAddress: null,
    eoaAddress: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

type RouteResult = {
  status: number;
  json: () => Promise<any>;
};

type MockResponse = {
  locals: Record<string, unknown>;
  statusCode: number;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
  send: (data: unknown) => MockResponse;
  end: (data?: unknown) => MockResponse;
  setHeader: () => MockResponse;
  getHeader: () => undefined;
  removeHeader: () => MockResponse;
  set: () => MockResponse;
  header: () => MockResponse;
};

type Routable = {
  handle: (req: Request, res: Response, next: (err?: unknown) => void) => void;
};

function invokeClaimsRoute(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<RouteResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let payload: unknown = undefined;

    const req = {
      method,
      url: path,
      originalUrl: path,
      baseUrl: "",
      path,
      headers: options.headers ?? {},
      body: options.body,
    } as Request;

    const mockRes: MockResponse = {
      locals: {},
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: unknown) {
        payload = data;
        settled = true;
        resolve({ status: this.statusCode, json: async () => data });
        return this;
      },
      send(data: unknown) {
        payload = data;
        settled = true;
        resolve({ status: this.statusCode, json: async () => data });
        return this;
      },
      end(data?: unknown) {
        if (!settled) {
          payload = data;
          settled = true;
          resolve({ status: this.statusCode, json: async () => data });
        }
        return this;
      },
      setHeader() {
        return this;
      },
      getHeader() {
        return undefined;
      },
      removeHeader() {
        return this;
      },
      set() {
        return this;
      },
      header() {
        return this;
      },
    };

    const res = mockRes as unknown as Response;
    (claimsRouter as unknown as Routable).handle(req, res, (err?: unknown) => {
      if (err) {
        reject(err);
        return;
      }
      if (!settled) {
        resolve({ status: mockRes.statusCode, json: async () => payload });
      }
    });
  });
}

function getMe(headers: Record<string, string> = {}) {
  return invokeClaimsRoute("GET", "/claims/me", { headers });
}
function postExecute(body: unknown, headers: Record<string, string> = {}) {
  return invokeClaimsRoute("POST", "/claims/execute", {
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("GET /claims/me", () => {
  it("미인증(X-API-Key 없음) → 401", async () => {
    const res = await getMe();
    expect(res.status).toBe(401);
  });

  it("receipt 없는 creator → zero summary, 200", async () => {
    asCliUser();
    // getCreatorEarnings: agg 쿼리(0) + latest 쿼리(없음)
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ gross_earned_usd_micros: "0", reconciled_deposited_usd_micros: "0", payment_count: 0 }],
      })
      .mockResolvedValueOnce({ rows: [] });
    mockClaimableBalance.mockResolvedValue(0n);

    const res = await getMe({ "x-api-key": "pw_cli" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.db.grossEarnedUsdMicros).toBe("0");
    expect(body.db.paymentCount).toBe(0);
    expect(body.onchain.claimableBaseUnits).toBe("0");
    expect(body.creator).toBe(CLI_EOA.toLowerCase());
  });

  it("receipt 있는 creator → gross + count, claimable는 string", async () => {
    asCliUser();
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ gross_earned_usd_micros: "12500000", reconciled_deposited_usd_micros: "12500000", payment_count: 5 }],
      })
      .mockResolvedValueOnce({ rows: [{ vault_tx_hash: "0xabc", created_at: "2026-06-01T00:00:00.000Z" }] });
    mockClaimableBalance.mockResolvedValue(12500000n);

    const res = await getMe({ "x-api-key": "pw_cli" });
    const body = await res.json();
    expect(body.db.grossEarnedUsdMicros).toBe("12500000");
    expect(body.db.paymentCount).toBe(5);
    expect(body.db.latestVaultTxHash).toBe("0xabc");
    expect(body.db.latestPaymentAt).toBe("2026-06-01T00:00:00.000Z");
    expect(typeof body.onchain.claimableBaseUnits).toBe("string");
    expect(body.onchain.claimableBaseUnits).toBe("12500000");
    expect(body.reconciled).toBe(true);
    expect(body.warnings).toEqual([]);
    // creator는 서버 유도 — query가 lowercased creator로 호출됐는지 확인
    expect(mockPoolQuery.mock.calls[0][1][0]).toBe(CLI_EOA.toLowerCase());
  });

  it("on-chain read 실패 → 200 + onchain.available=false + warning (500 아님)", async () => {
    asCliUser();
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ gross_earned_usd_micros: "5000000", reconciled_deposited_usd_micros: "5000000", payment_count: 2 }],
      })
      .mockResolvedValueOnce({ rows: [] });
    mockClaimableBalance.mockRejectedValue(new Error("RPC timeout"));

    const res = await getMe({ "x-api-key": "pw_cli" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.onchain.available).toBe(false);
    expect(body.onchain.claimableBaseUnits).toBeNull();
    expect(body.db.grossEarnedUsdMicros).toBe("5000000");
    expect(body.warnings).toContain("onchain_read_failed");
    expect(body.reconciled).toBe(false);
  });

  it("on-chain claimable > DB reconciled → mismatch warning", async () => {
    asCliUser();
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ gross_earned_usd_micros: "5000000", reconciled_deposited_usd_micros: "1000000", payment_count: 2 }],
      })
      .mockResolvedValueOnce({ rows: [] });
    mockClaimableBalance.mockResolvedValue(3000000n); // > reconciled 1000000

    const res = await getMe({ "x-api-key": "pw_cli" });
    const body = await res.json();
    expect(body.warnings).toContain("onchain_exceeds_db_reconciled");
    expect(body.reconciled).toBe(false);
    // gross와 claimable은 별개 필드로 분리 — 합쳐지지 않음
    expect(body.db.grossEarnedUsdMicros).toBe("5000000");
    expect(body.onchain.claimableBaseUnits).toBe("3000000");
  });

  it("웹 유저 smart wallet 없음 → no_creator_address, claim 불가", async () => {
    asWebUserNoWallet();
    const res = await getMe({ "x-api-key": "pw_web" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creator).toBeNull();
    expect(body.warnings).toContain("no_creator_address");
    expect(body.onchain.available).toBe(false);
    // DB 쿼리는 호출되지 않음 (creator 없음)
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});

describe("POST /claims/execute (웹 CDP 경로)", () => {
  it("미인증 → 401", async () => {
    const res = await postExecute({ amount: "1000000" });
    expect(res.status).toBe(401);
  });

  it("CLI/EOA 유저 → 400 (직접 서명 안내)", async () => {
    asCliUser();
    const res = await postExecute({ amount: "1000000" }, { "x-api-key": "pw_cli" });
    expect(res.status).toBe(400);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("amount > claimable → 400, UserOp 미전송", async () => {
    asWebUser();
    mockClaimableBalance.mockResolvedValue(1000000n);
    const res = await postExecute({ amount: "2000000" }, { "x-api-key": "pw_web" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.claimableBaseUnits).toBe("1000000");
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("amount <= 0 → 400", async () => {
    asWebUser();
    const res = await postExecute({ amount: "0" }, { "x-api-key": "pw_web" });
    expect(res.status).toBe(400);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("recipient zero address → 400", async () => {
    asWebUser();
    mockClaimableBalance.mockResolvedValue(5000000n);
    const res = await postExecute(
      { amount: "1000000", to: "0x0000000000000000000000000000000000000000" },
      { "x-api-key": "pw_web" }
    );
    expect(res.status).toBe(400);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("정상 → creator 서버 유도(본인 smart wallet)로 claim, txHash 반환", async () => {
    asWebUser();
    mockClaimableBalance.mockResolvedValue(5000000n);
    mockClaim.mockResolvedValue(CLAIM_TX);

    const res = await postExecute({ amount: "1000000", to: RECIPIENT }, { "x-api-key": "pw_web" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.txHash).toBe(CLAIM_TX);
    expect(body.amountBaseUnits).toBe("1000000");
    // claimFromSmartWallet이 creator 본인 smart wallet로 호출됐는지 (client 입력 아님)
    expect(mockClaim).toHaveBeenCalledOnce();
    const [smartWallet, amount, to] = mockClaim.mock.calls[0];
    expect(smartWallet).toBe(WEB_SMART);
    expect(amount).toBe(1000000n);
    expect(to.toLowerCase()).toBe(RECIPIENT.toLowerCase());
  });

  it("to 미지정 → 기본값 = 본인 smart wallet", async () => {
    asWebUser();
    mockClaimableBalance.mockResolvedValue(5000000n);
    mockClaim.mockResolvedValue(CLAIM_TX_2);
    const res = await postExecute({ amount: "1000000" }, { "x-api-key": "pw_web" });
    expect(res.status).toBe(200);
    const [, , to] = mockClaim.mock.calls[0];
    expect(to.toLowerCase()).toBe(WEB_SMART.toLowerCase());
  });

  it("UserOp 실패 → 502", async () => {
    asWebUser();
    mockClaimableBalance.mockResolvedValue(5000000n);
    mockClaim.mockRejectedValue(new Error("Claim UserOp failed: 0xdead"));
    const res = await postExecute({ amount: "1000000", to: RECIPIENT }, { "x-api-key": "pw_web" });
    expect(res.status).toBe(502);
  });

  it("동일 creator 동시 claim → 두 번째는 409 (in-flight 가드)", async () => {
    asWebUser();
    mockClaimableBalance.mockResolvedValue(5000000n);
    // 첫 claim을 게이트로 잡아두어 lock 보유 상태를 만든다
    let release!: (v: string) => void;
    mockClaim.mockReturnValue(new Promise<string>((r) => { release = r; }));

    const p1 = postExecute({ amount: "1000000", to: RECIPIENT }, { "x-api-key": "pw_web" });
    await new Promise((r) => setTimeout(r, 40)); // p1이 lock 획득할 시간
    const res2 = await postExecute({ amount: "1000000", to: RECIPIENT }, { "x-api-key": "pw_web" });
    expect(res2.status).toBe(409);

    release(CLAIM_TX);
    const res1 = await p1;
    expect(res1.status).toBe(200);
  });
});

describe("no-operator-custody 정적 가드", () => {
  it("claims 라우트는 operator 서명 경로를 import하지 않는다", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../routes/claims.ts", import.meta.url)),
      "utf8"
    );
    expect(src).not.toMatch(/walletClient/);
    expect(src).not.toMatch(/vaultWrite/);
    expect(src).not.toMatch(/registryWrite/);
    expect(src).not.toMatch(/operatorAccount/);
    // CDP 위임 경로(claimFromSmartWallet)는 사용 — 유저 본인 지갑
    expect(src).toMatch(/claimFromSmartWallet/);
  });
});
