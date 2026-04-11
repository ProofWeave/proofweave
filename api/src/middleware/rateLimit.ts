import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1분
const MAX_REQUESTS = 100; // 윈도우당 최대 요청

// 메모리 기반 (프로덕션에서는 Redis로 교체)
const store = new Map<string, RateLimitEntry>();

// 5분마다 만료된 엔트리 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60_000);

/**
 * Rate limit 미들웨어
 * API Key 기반 (없으면 IP 기반)
 */
export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const identifier =
    (req.headers["x-api-key"] as string) || req.ip || "unknown";

  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    // 새 윈도우 시작
    store.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.status(429).json({
      error: "Too many requests",
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  next();
}
