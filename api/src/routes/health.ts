import { Router } from "express";
import { publicClient, operatorAccount } from "../config/chain.js";
import { registryRead } from "../contracts/attestationRegistry.js";
import { testDbConnection } from "../services/db.js";
import { testPinataConnection } from "../services/ipfs.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const services: Record<string, string> = {};

  // 1. Database
  const dbOk = await testDbConnection();
  services.db = dbOk ? "connected" : "disconnected";

  // 2. Chain RPC
  let chainOk = false;
  try {
    const blockNumber = await publicClient.getBlockNumber();
    services.chain = `connected (block: ${blockNumber})`;
    chainOk = true;
  } catch {
    services.chain = "disconnected";
  }

  // 3. Contract (proxy 정상 여부)
  let contractOk = false;
  try {
    const onChainOperator = (await registryRead.read.operator()) as string;
    const signerMatch =
      onChainOperator.toLowerCase() === operatorAccount.address.toLowerCase();
    services.contract = signerMatch
      ? "verified"
      : "signer mismatch — attest() will fail";
    contractOk = signerMatch;
  } catch {
    services.contract = "unreachable";
  }

  // 4. IPFS (Pinata)
  const pinataOk = await testPinataConnection();
  services.ipfs = pinataOk ? "connected" : "disconnected";

  // 5. Signer (쓰기 경로 검증)
  services.signer = contractOk ? "authorized" : "unauthorized";

  // 전체 상태
  const allOk = dbOk && chainOk && contractOk && pinataOk;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    services,
    proxy: env.PROXY_ADDRESS,
    timestamp: new Date().toISOString(),
  });
});
