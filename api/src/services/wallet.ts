import { getCdpClient } from "../config/cdp.js";
import { env } from "../config/env.js";
import { pool } from "./db.js";
import type { SmartWalletInfo } from "../types/payment.js";

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

  // 3. DB에 스마트 지갑 주소 + EOA 주소 저장
  //    EOA 주소는 checksummed 원본 유지 (CDP getAccount 조회 시 필요)
  //    smart_wallet_address는 lowercase (DB 조회 일관성)
  await pool.query(
    `UPDATE api_keys SET smart_wallet_address = $1, eoa_address = $2
     WHERE wallet_address = $3 AND revoked_at IS NULL`,
    [smartWalletAddress.toLowerCase(), evmAccount.address, ownerAddress.toLowerCase()]
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

  // USDC 잔고 찾기
  // CDP SDK: EvmTokenBalance = { token: { contractAddress, symbol? }, amount: { amount: bigint, decimals: number } }
  let balanceUsdMicros = 0;
  const balances = balancesResult.balances ?? [];
  for (const balance of balances) {
    const isUsdc =
      balance.token?.symbol?.toUpperCase() === "USDC" ||
      balance.token?.contractAddress?.toLowerCase() ===
      env.USDC_CONTRACT_ADDRESS.toLowerCase();

    if (isUsdc) {
      // amount.amount is in smallest unit (6 decimals for USDC = already micros)
      balanceUsdMicros = Number(balance.amount?.amount ?? 0n);
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

// USDC 컨트랙트 주소 (env에서 관리 — 네트워크별 상이)
const USDC_CONTRACT_ADDRESS = env.USDC_CONTRACT_ADDRESS as `0x${string}`;

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

  // 1. DB에서 이 Smart Wallet의 owner EOA 주소 조회
  const eoaResult = await pool.query(
    `SELECT eoa_address, wallet_address FROM api_keys
     WHERE smart_wallet_address = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [smartWalletAddress.toLowerCase()]
  );
  let eoaAddress = eoaResult.rows[0]?.eoa_address;
  const ownerWalletAddress = eoaResult.rows[0]?.wallet_address;

  // Auto-heal: EOA 없으면 Smart Wallet 재생성 (eoa_address 컬럼 추가 전 생성분)
  if (!eoaAddress && ownerWalletAddress) {
    console.warn(`[wallet] Auto-healing: recreating smart wallet for ${ownerWalletAddress}`);
    const newSmartWalletAddress = await createSmartWallet(ownerWalletAddress);

    // 재귀 방지: 새로 생성된 월렛의 EOA 직접 조회
    const newEoaResult = await pool.query(
      `SELECT eoa_address FROM api_keys
       WHERE smart_wallet_address = $1 AND revoked_at IS NULL
       LIMIT 1`,
      [newSmartWalletAddress.toLowerCase()]
    );
    eoaAddress = newEoaResult.rows[0]?.eoa_address;
    // 주소가 바뀌었으므로 caller에게 알림 (에러로)
    throw new Error(
      `[wallet] Smart wallet recreated. New address: ${newSmartWalletAddress}. ` +
      `Please fund this address and retry.`
    );
  }

  if (!eoaAddress) {
    throw new Error(`[wallet] No EOA found for smart wallet: ${smartWalletAddress}`);
  }

  // 2. EOA 계정 객체 조회 (CDP TEE에서 관리)
  const ownerAccount = await cdp.evm.getAccount({
    address: eoaAddress as `0x${string}`,
  });

  // 3. Smart Account 객체 조회 (owner 필수)
  const smartAccount = await cdp.evm.getSmartAccount({
    address: smartWalletAddress as `0x${string}`,
    owner: ownerAccount,
  });

  // 2. Smart Account는 sendUserOperation 사용 (ERC-4337)
  //    sendTransaction은 EOA 전용 — Smart Account에 사용하면 실패
  const userOp = await cdp.evm.sendUserOperation({
    smartAccount,
    network: "base-sepolia",
    calls: [{
      to: USDC_CONTRACT_ADDRESS,
      value: 0n,
      // ERC-20 transfer(address, uint256) — 수신자: operator, 금액: amountUsdMicros
      data: encodeUsdcTransfer(toAddress, amountUsdMicros),
    }],
  });

  // 3. UserOp 완료 대기 → transactionHash 획득
  const result = await cdp.evm.waitForUserOperation({
    userOpHash: userOp.userOpHash,
    smartAccountAddress: userOp.smartAccountAddress,
    waitOptions: { timeoutSeconds: 60 },
  });

  if (result.status === "failed") {
    throw new Error(`[wallet] USDC UserOp failed: ${result.userOpHash}`);
  }

  const txHash = result.transactionHash;
  if (!txHash) {
    throw new Error("[wallet] No txHash after UserOp completion");
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

