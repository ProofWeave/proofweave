import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "../middleware/rateLimit.js";

function createMockReq(apiKey?: string, ip?: string): Request {
  return {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    ip: ip || "127.0.0.1",
  } as unknown as Request;
}

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("rateLimit middleware", () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow requests within limit", () => {
    const req = createMockReq("pw_test_rate_1");
    const res = createMockRes();

    rateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should block requests exceeding limit", () => {
    const apiKey = "pw_test_rate_flood_" + Date.now();

    // 100 요청 통과
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(apiKey);
      const res = createMockRes();
      const n: NextFunction = vi.fn();
      rateLimit(req, res, n);
    }

    // 101번째 요청 차단
    const req = createMockReq(apiKey);
    const res = createMockRes();
    rateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
  });
});
