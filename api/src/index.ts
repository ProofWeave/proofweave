import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────
app.use(healthRouter);

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
