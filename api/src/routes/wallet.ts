import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getSmartWalletAddress, getWalletBalance, createSmartWallet } from "../services/wallet.js";

export const walletRouter = Router();

/**
 * POST /wallet/create
 * Smart Wallet 수동 생성 (없는 경우)
 */
walletRouter.post("/wallet/create", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // 기존 Smart Wallet 존재 + EOA도 있으면 → 기존 반환
  const existing = await getSmartWalletAddress(owner);
  if (existing) {
    // EOA가 있는지 확인 (없으면 재생성 필요)
    const { pool } = await import("../services/db.js");
    const eoaCheck = await pool.query(
      `SELECT eoa_address FROM api_keys
       WHERE wallet_address = $1 AND smart_wallet_address = $2 AND revoked_at IS NULL LIMIT 1`,
      [owner.toLowerCase(), existing.toLowerCase()]
    );
    if (eoaCheck.rows[0]?.eoa_address) {
      res.status(200).json({ smartWalletAddress: existing, created: false });
      return;
    }
    // EOA 없음 → 재생성 (아래로 fall-through)
    console.warn(`[wallet] Smart wallet ${existing} has no EOA. Recreating...`);
  }

  try {
    const smartWalletAddress = await createSmartWallet(owner);
    res.status(201).json({ smartWalletAddress, created: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[wallet] Smart wallet creation failed:", errMsg);
    res.status(500).json({ error: "Smart wallet creation failed", message: errMsg });
  }
});

/**
 * GET /wallet/balance
 * 에이전트의 스마트 지갑 잔고 조회
 */
walletRouter.get("/wallet/balance", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const smartWalletAddress = await getSmartWalletAddress(owner);

  if (!smartWalletAddress) {
    res.status(404).json({
      error: "No smart wallet found",
      message: "Smart wallet is created during registration. Try POST /auth/register.",
    });
    return;
  }

  const info = await getWalletBalance(smartWalletAddress);

  res.status(200).json({
    smartWalletAddress: info.address,
    ownerAddress: info.ownerAddress,
    balanceUsdMicros: info.balanceUsdMicros,
    balanceUsd: (info.balanceUsdMicros / 1_000_000).toFixed(6),
    currency: "USDC",
    network: "eip155:84532",
  });
});

/**
 * GET /wallet/address
 * 에이전트의 스마트 지갑 주소만 조회 (USDC 입금용)
 */
walletRouter.get("/wallet/address", authenticate, async (req, res) => {
  const owner = req.apiKeyOwner;
  if (!owner) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const smartWalletAddress = await getSmartWalletAddress(owner);

  if (!smartWalletAddress) {
    res.status(404).json({ error: "No smart wallet found" });
    return;
  }

  res.status(200).json({
    smartWalletAddress,
    message: "Send USDC to this address to fund your agent's wallet.",
  });
});
