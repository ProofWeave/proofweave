import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { pricingRouter } from "./routes/pricing.js";
import { walletRouter } from "./routes/wallet.js";
import { attestRouter } from "./routes/attest.js";
import { attestationsRouter } from "./routes/attestations.js";
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

// ── Wallet Routes (Phase 2-4) ───────────────────────────────
app.use(walletRouter);     // GET /wallet/balance, GET /wallet/address

// ── Attestation Routes (Phase 2-5) ──────────────────────────
app.use(attestRouter);         // POST /attest (authenticated)
app.use(attestationsRouter);   // GET /attestations/:id, /detail, /verify, /search

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
