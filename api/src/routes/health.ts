import { Router } from "express";
import { publicClient } from "../config/chain.js";
import { registryRead } from "../contracts/attestationRegistry.js";
import { testDbConnection } from "../services/db.js";
import { testPinataConnection } from "../services/ipfs.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const services: Record<string, string> = {};

  // 1. Database
  const dbOk = await testDbConnection();
  services.db = dbOk ? "connected" : "disconnected";

  // 2. Chain (Base Sepolia)
  try {
    const blockNumber = await publicClient.getBlockNumber();
    const owner = await registryRead.read.owner();
    services.chain = `connected (block: ${blockNumber})`;
    services.contract = `proxy verified (owner: ${owner})`;
  } catch (err) {
    services.chain = `error: ${err instanceof Error ? err.message : "unknown"}`;
  }

  // 3. IPFS (Pinata)
  const pinataOk = await testPinataConnection();
  services.ipfs = pinataOk ? "connected" : "disconnected";

  // 전체 상태
  const allOk = dbOk && services.chain.startsWith("connected") && pinataOk;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    services,
    timestamp: new Date().toISOString(),
  });
});
