import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // 서버 로그에만 상세 에러 기록
  console.error("[UnhandledError]", {
    message: err instanceof Error ? err.message : "Unknown error",
    stack: err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  });

  // 클라이언트에는 일반화된 메시지만 반환
  res.status(500).json({
    error: "Internal server error",
  });
};
