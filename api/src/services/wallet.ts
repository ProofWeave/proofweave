import { getCdpClient } from "../config/cdp.js";
import { env } from "../config/env.js";
import { pool } from "./db.js";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import type { SmartWalletInfo } from "../types/payment.js";

// viem PublicClient — tx finality 확인용
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC_URL),
});

/**
 * CDP Smart Wallet 서비스
 *
 * 에이전트를 위한 스마트 지갑 관리:
 * - 생성: register 시 ERC-4337 Smart Account 자동 생성
 * - 잔고 조회: USDC 잔고 확인
 * - 전송: 결제 시 스마트 지갑 → operator로 USDC 자동 전송
 */

// ── 스마트 지갑 생성 ─────────────────────────────────────────

/**
 * CDP를 통해 에이전트용 Smart Account 생성
 * 이 주소로 소유자가 USDC를 입금하면 에이전트가 자동 결제 가능
 */
export async function createSmartWallet(
  ownerAddress: string
): Promise<string> {
  if (!env.CDP_API_KEY_ID) {
    throw new Error("CDP credentials not configured");
  }

  const cdp = getCdpClient();

  // 1. EOA 계정 생성 (스마트 지갑의 owner/signer)
  const evmAccount = await cdp.evm.createAccount();

  // 2. Smart Account 생성 (ERC-4337)
  const smartAccount = await cdp.evm.createSmartAccount({
    owner: evmAccount,
  });

  const smartWalletAddress = smartAccount.address;

  // 3. DB에 스마트 지갑 주소 저장
  await pool.query(
    `UPDATE api_keys SET smart_wallet_address = $1
     WHERE wallet_address = $2 AND revoked_at IS NULL`,
    [smartWalletAddress.toLowerCase(), ownerAddress.toLowerCase()]
  );

  return smartWalletAddress;
}

// ── 스마트 지갑 조회 ─────────────────────────────────────────

/**
 * API Key 소유자의 스마트 지갑 주소 조회
 */
export async function getSmartWalletAddress(
  ownerAddress: string
): Promise<string | null> {
  const result = await pool.query(
    `SELECT smart_wallet_address FROM api_keys
     WHERE wallet_address = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [ownerAddress.toLowerCase()]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].smart_wallet_address ?? null;
}

// ── USDC 잔고 조회 ───────────────────────────────────────────

/**
 * 스마트 지갑의 USDC 잔고 조회 (USD micros 단위)
 * 실제로는 온체인 USDC.balanceOf() 호출
 */
export async function getWalletBalance(
  smartWalletAddress: string
): Promise<SmartWalletInfo> {
  if (!env.CDP_API_KEY_ID) {
    // CDP 미설정 시 0 반환 (개발 모드)
    return {
      address: smartWalletAddress,
      ownerAddress: "",
      balanceUsdMicros: 0,
    };
  }

  const cdp = getCdpClient();

  // USDC 잔고 조회 (Base Sepolia)
  const balancesResult = await cdp.evm.listTokenBalances({
    address: smartWalletAddress as `0x${string}`,
    network: "base-sepolia",
  });

  // USDC 잔고 찾기 (6 decimals = USD micros)
  let balanceUsdMicros = 0;
  const balancesList = Array.isArray(balancesResult)
    ? balancesResult
    : (balancesResult as { balances?: unknown[] }).balances ?? [];
  for (const balance of balancesList) {
    const b = balance as { token?: { symbol?: string; contractAddress?: string }; amount?: string | number };
    if (
      b.token?.symbol?.toUpperCase() === "USDC" ||
      b.token?.contractAddress?.toLowerCase() ===
        "0x036cbd53842c5426634e7929541ec2318f3dcf7e" // Base Sepolia USDC
    ) {
      balanceUsdMicros = Number(b.amount ?? 0);
      break;
    }
  }

  // owner 주소 조회
  const ownerResult = await pool.query(
    `SELECT wallet_address FROM api_keys
     WHERE smart_wallet_address = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [smartWalletAddress.toLowerCase()]
  );

  return {
    address: smartWalletAddress,
    ownerAddress: ownerResult.rows[0]?.wallet_address ?? "",
    balanceUsdMicros,
  };
}

// ── USDC 전송 (결제 실행) ────────────────────────────────────

// Base Sepolia USDC 컨트랙트 주소
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/**
 * 스마트 지갑에서 operator 주소로 USDC 전송
 * CDP Server Wallet의 TEE에서 서명 → Policy Engine 검증 → 온체인 전송
 *
 * ⚠️ P0-1: to는 USDC 컨트랙트 주소 (ERC-20 transfer calldata)
 * ⚠️ P0-2: tx finality 확인 후에만 txHash 반환
 *
 * @returns 확정된 txHash (revert 시 에러 throw)
 */
export async function transferUsdcFromSmartWallet(
  smartWalletAddress: string,
  toAddress: string,
  amountUsdMicros: number
): Promise<string> {
  if (!env.CDP_API_KEY_ID) {
    // CDP 미설정 시 스킵 (개발 모드)
    console.warn(
      "[wallet] DEV MODE: skipping USDC transfer",
      { from: smartWalletAddress, to: toAddress, amount: amountUsdMicros }
    );
    return `dev-tx-${Date.now()}`;
  }

  const cdp = getCdpClient();

  // P0-1: to = USDC 컨트랙트 주소 (operator가 아님!)
  const sendResult = await cdp.evm.sendTransaction({
    address: smartWalletAddress as `0x${string}`,
    network: "base-sepolia",
    transaction: {
      to: USDC_CONTRACT_ADDRESS,
      value: 0n,
      // ERC-20 transfer(address, uint256) — 수신자: operator, 금액: amountUsdMicros
      data: encodeUsdcTransfer(toAddress, amountUsdMicros),
    },
  });

  const txHash = sendResult.transactionHash;
  if (!txHash) {
    throw new Error("[wallet] No txHash returned from CDP sendTransaction");
  }

  // P0-2: viem으로 tx finality 확인 — 온체인 확정 대기
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: 60_000, // 60초 대기
  });

  if (receipt.status === "reverted") {
    throw new Error(`[wallet] USDC transfer reverted: ${txHash}`);
  }

  return txHash;
}

/**
 * USDC transfer(address, uint256) ABI 인코딩
 * selector: 0xa9059cbb
 */
function encodeUsdcTransfer(to: string, amount: number): `0x${string}` {
  const selector = "a9059cbb";
  const paddedTo = to.replace("0x", "").toLowerCase().padStart(64, "0");
  const paddedAmount = BigInt(amount).toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

