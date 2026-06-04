import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../services/auth.js", () => ({
  verifyApiKey: vi.fn(),
}));

const mockPoolQuery = vi.fn();
vi.mock("../services/db.js", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

vi.mock("../services/analytics.js", () => ({
  getUserAnalyticsSummary: vi.fn(),
  parseAnalyticsRange: vi.fn(() => "30d"),
}));

import { verifyApiKey } from "../services/auth.js";
import { statsRouter } from "../routes/stats.js";

const mockVerifyApiKey = vi.mocked(verifyApiKey);

const WEB_SMART = "0x1111111111111111111111111111111111111111";
const CLI_EOA = "0x2222222222222222222222222222222222222222";

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

function invokeStatsRoute(
  method: "GET",
  path: string,
  options: { headers?: Record<string, string> } = {}
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
    (statsRouter as unknown as Routable).handle(req, res, (err?: unknown) => {
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
  return invokeStatsRoute("GET", "/stats/me", { headers });
}

function mockStatsQueries(attestationCount: number) {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ count: 2 }] })
    .mockResolvedValueOnce({ rows: [{ total: "1250000" }] })
    .mockResolvedValueOnce({ rows: [{ count: attestationCount }] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /stats/me", () => {
  it("미인증(X-API-Key 없음) → 401", async () => {
    const res = await getMe();
    expect(res.status).toBe(401);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("웹 유저의 등록 수는 apiKeyOwner가 아니라 Smart Wallet creator로 집계한다", async () => {
    asWebUser();
    mockStatsQueries(3);

    const res = await getMe({ "x-api-key": "pw_web" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalPurchases).toBe(2);
    expect(body.totalSpentUsdMicros).toBe(1250000);
    expect(body.totalAttestations).toBe(3);

    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
    expect(mockPoolQuery.mock.calls[0][1][0]).toBe("web:creator@example.com");
    expect(mockPoolQuery.mock.calls[1][1][0]).toBe("web:creator@example.com");
    expect(mockPoolQuery.mock.calls[2][0]).toContain("LOWER(creator)");
    expect(mockPoolQuery.mock.calls[2][1]).toEqual([WEB_SMART.toLowerCase()]);
  });

  it("CLI 유저의 등록 수는 본인 EOA creator로 집계한다", async () => {
    asCliUser();
    mockStatsQueries(4);

    const res = await getMe({ "x-api-key": "pw_cli" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalAttestations).toBe(4);
    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
    expect(mockPoolQuery.mock.calls[2][1]).toEqual([CLI_EOA.toLowerCase()]);
  });

  it("웹 유저에게 Smart Wallet이 없으면 등록 수는 0이고 구매/지출 집계는 유지한다", async () => {
    asWebUserNoWallet();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: "500000" }] });

    const res = await getMe({ "x-api-key": "pw_web" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalPurchases).toBe(1);
    expect(body.totalSpentUsdMicros).toBe(500000);
    expect(body.totalAttestations).toBe(0);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });
});
