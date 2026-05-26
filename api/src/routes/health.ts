import { Router } from "express";
import { publicClient, operatorAccount } from "../config/chain.js";
import { registryRead } from "../contracts/attestationRegistry.js";
import { testDbConnection } from "../services/db.js";
import { testPinataConnection } from "../services/ipfs.js";
import { env } from "../config/env.js";
import { reconcileUnresolvedDeposits } from "../services/vaultReconciliation.js";

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

/**
 * POST /admin/reconcile
 * 온체인 Vault 이벤트를 강제로 대조/화해하여 DB 레코드를 동기화합니다.
 */
healthRouter.post("/admin/reconcile", async (req, res) => {
  const { fromBlock } = req.body as { fromBlock?: string | number };
  const fromBlockBigInt = fromBlock !== undefined ? BigInt(fromBlock) : undefined;

  try {
    const stats = await reconcileUnresolvedDeposits(fromBlockBigInt);
    res.status(200).json({
      success: true,
      message: "Reconciliation completed successfully",
      stats: {
        processed: stats.processed,
        reconciled: stats.reconciled,
        failed: stats.failed,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Reconciliation failed", detail: message });
  }
});
