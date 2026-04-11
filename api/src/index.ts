import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";

const app = express();

// ── Global Middleware ───────────────────────────────────────
app.use(express.json());
app.use(rateLimit);

// ── Routes ──────────────────────────────────────────────────
app.use(healthRouter);     // GET /health (public)
app.use(authRouter);       // POST /auth/register, /auth/rotate (public)

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
