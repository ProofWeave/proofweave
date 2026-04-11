import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1분
const MAX_REQUESTS = 100; // 윈도우당 최대 요청
const MAX_STORE_SIZE = 10_000; // 메모리 폭발 방지 상한

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
 * 항상 IP 기반 식별 (Codex #2: API Key 기반 우회 방지)
 * 인증된 요청은 이후 별도 rate limit 적용 가능
 */
export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 항상 IP 기반 — 인증 전이므로 API Key를 신뢰할 수 없음
  const identifier = req.ip || req.socket.remoteAddress || "unknown";

  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    // 메모리 상한 초과 시 가장 오래된 엔트리 정리
    if (store.size >= MAX_STORE_SIZE) {
      const oldestKey = store.keys().next().value;
      if (oldestKey) store.delete(oldestKey);
    }

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
