import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { env } from "./env.js";

/** 읽기 전용 클라이언트 — verify, getAttestation 등 */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC_URL),
});

/**
 * operator 계정 — attest tx 전송용
 * OPERATOR_PRIVATE_KEY가 있으면 사용, 없으면 DEPLOYER_PRIVATE_KEY fallback
 */
const operatorKey = (env.OPERATOR_PRIVATE_KEY ?? env.DEPLOYER_PRIVATE_KEY) as `0x${string}`;
export const operatorAccount = privateKeyToAccount(operatorKey);

// 부팅 시 파생 주소가 OPERATOR_ADDRESS와 일치하는지 검증
if (operatorAccount.address.toLowerCase() !== env.OPERATOR_ADDRESS.toLowerCase()) {
  console.error(
    `❌ Operator key mismatch!\n` +
    `   Derived: ${operatorAccount.address}\n` +
    `   Expected: ${env.OPERATOR_ADDRESS}\n` +
    `   The private key does not match OPERATOR_ADDRESS.`
  );
  process.exit(1);
}

/** 쓰기 클라이언트 — attest tx 전송 (operator 권한) */
export const walletClient = createWalletClient({
  account: operatorAccount,
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC_URL),
});
