import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getSmartWalletAddress, getWalletBalance } from "../services/wallet.js";

export const walletRouter = Router();

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
