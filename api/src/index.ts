import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { pricingRouter } from "./routes/pricing.js";
import { walletRouter } from "./routes/wallet.js";
import { attestRouter } from "./routes/attest.js";
import { attestationsRouter } from "./routes/attestations.js";
import { aiRouter } from "./routes/ai.js";
import { taintGuardRouter } from "./routes/taintGuard.js";
import { statsRouter } from "./routes/stats.js";
import { purchasesRouter } from "./routes/purchases.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";

const app = express();

// ── Global Middleware ───────────────────────────────────────
app.use(cors({
  origin: env.NODE_ENV === "production"
    ? ["https://proofweave.vercel.app"]
    : [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit);

// ── Public Routes ───────────────────────────────────────────
app.use(healthRouter);     // GET /health
app.use(authRouter);       // POST /auth/register, /auth/rotate

// ── Pricing Routes ──────────────────────────────────────────
app.use(pricingRouter);    // POST /pricing (authenticated), GET /pricing/:id (public)

// ── Wallet Routes (Phase 2-4) ───────────────────────────────
app.use(walletRouter);     // GET /wallet/balance, GET /wallet/address
app.use(statsRouter);      // GET /stats/me (authenticated)
app.use(purchasesRouter);  // GET /purchases/mine, /purchases/history

// ── Attestation Routes (Phase 2-5) ──────────────────────────
app.use(attestRouter);         // POST /attest (authenticated)
app.use(attestationsRouter);   // GET /attestations/:id, /detail, /verify, /search
app.use(aiRouter);             // POST /ai/analyze (authenticated)
app.use(taintGuardRouter);     // POST /taint/evaluate (authenticated)

// ── Error Handler ───────────────────────────────────────────
app.use(errorHandler);

// ── Start (마이그레이션 → 서버 리슨) ─────────────────────────
async function start() {
  try {
    await runMigrations();
  } catch {
    console.error("⚠️ Migration failed — server starting without migration");
  }

  app.listen(env.PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════╗
  ║  ProofWeave API Server                ║
  ║  Port: ${String(env.PORT).padEnd(30)}║
  ║  Health: http://localhost:${env.PORT}/health  ║
  ╚═══════════════════════════════════════╝
  `);
  });
}

start();

export { app };

