import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { pricingRouter } from "./routes/pricing.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";

const app = express();

// ── Global Middleware ───────────────────────────────────────
app.use(express.json());
app.use(rateLimit);

// ── Public Routes ───────────────────────────────────────────
app.use(healthRouter);     // GET /health
app.use(authRouter);       // POST /auth/register, /auth/rotate

// ── Pricing Routes ──────────────────────────────────────────
app.use(pricingRouter);    // POST /pricing (authenticated), GET /pricing/:id (public)

// TODO: Phase 2-5에서 authenticate + x402Gate 미들웨어를 적용한 라우트 추가
// app.use("/attestations", authenticate, attestationRouter);

// ── Error Handler ───────────────────────────────────────────
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║  ProofWeave API Server                ║
  ║  Port: ${String(env.PORT).padEnd(30)}║
  ║  Health: http://localhost:${env.PORT}/health  ║
  ╚═══════════════════════════════════════╝
  `);
});

export { app };
