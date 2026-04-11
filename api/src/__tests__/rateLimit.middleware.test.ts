import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "../middleware/rateLimit.js";

function createMockReq(ip?: string): Request {
  return {
    headers: {},
    ip: ip || "127.0.0.1",
    socket: { remoteAddress: ip || "127.0.0.1" },
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
    const req = createMockReq("10.0.0.1");
    const res = createMockRes();

    rateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should block requests exceeding limit by IP", () => {
    const ip = "10.0.0." + Date.now();

    // 100 요청 통과
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip);
      const res = createMockRes();
      const n: NextFunction = vi.fn();
      rateLimit(req, res, n);
    }

    // 101번째 요청 차단
    const req = createMockReq(ip);
    const res = createMockRes();
    rateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("should use IP not API Key header as identifier", () => {
    // 동일 IP에서 다른 API Key 헤더로 보내도 같은 버킷
    const ip = "10.0.1." + Date.now();
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip);
      req.headers = { "x-api-key": `pw_fake_${i}` };
      const res = createMockRes();
      const n: NextFunction = vi.fn();
      rateLimit(req, res, n);
    }

    const req = createMockReq(ip);
    req.headers = { "x-api-key": "pw_yet_another" };
    const res = createMockRes();
    rateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
  });
});
