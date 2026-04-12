import type { Request, Response, NextFunction } from "express";
import { verifyApiKey } from "../services/auth.js";

// Express Request에 apiKeyOwner 추가
declare global {
  namespace Express {
    interface Request {
      apiKeyOwner?: string;
      smartWalletAddress?: string | null;
    }
  }
}

/**
 * API Key 인증 미들웨어
 * X-API-Key 헤더에서 키를 읽어 DB 검증
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: "X-API-Key header is required" });
    return;
  }

  const result = await verifyApiKey(apiKey);

  if (!result) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }

  // 인증된 지갑 주소를 request에 첨부
  req.apiKeyOwner = result.walletAddress;
  req.smartWalletAddress = result.smartWalletAddress;
  next();
}
