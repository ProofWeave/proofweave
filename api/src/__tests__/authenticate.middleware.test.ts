import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// DB 의존성 mock
vi.mock("../services/auth.js", () => ({
  verifyApiKey: vi.fn(),
}));

import { authenticate } from "../middleware/authenticate.js";
import { verifyApiKey } from "../services/auth.js";

const mockVerifyApiKey = vi.mocked(verifyApiKey);

function createMockReq(headers: Record<string, string> = {}): Request {
  return { headers, apiKeyOwner: undefined } as unknown as Request;
}

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("authenticate middleware", () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject request without X-API-Key header", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "X-API-Key header is required",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject invalid API key", async () => {
    const req = createMockReq({ "x-api-key": "pw_invalid" });
    const res = createMockRes();
    mockVerifyApiKey.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should pass with valid API key", async () => {
    const req = createMockReq({ "x-api-key": "pw_validkey" });
    const res = createMockRes();
    mockVerifyApiKey.mockResolvedValue({ walletAddress: "0xabc", smartWalletAddress: null });

    await authenticate(req, res, next);

    expect(req.apiKeyOwner).toBe("0xabc");
    expect(next).toHaveBeenCalled();
  });
});
