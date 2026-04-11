import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { env } from "./env.js";

/** 읽기 전용 클라이언트 — verify, getAttestation 등 */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC_URL),
});

/** 쓰기 클라이언트 — attest tx 전송 (operator 권한) */
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY as `0x${string}`);

export const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(env.BASE_SEPOLIA_RPC_URL),
});

export { account };
