import { getContract } from "viem";
import { attestationRegistryAbi } from "./abi.js";
import { publicClient, walletClient } from "../config/chain.js";
import { env } from "../config/env.js";

// ABI는 소스 관리되는 정적 파일에서 로드 (Foundry 아티팩트 의존 제거)
type Hex = `0x${string}`;

type AttestationTuple = {
  contentHash: Hex;
  creator: Hex;
  aiModel: string;
  timestamp: bigint;
  offchainRef: string;
};

type RegistryContract = {
  address: Hex;
  read: {
    operator: () => Promise<Hex>;
    verify: (args: readonly [Hex, Hex]) => Promise<AttestationTuple>;
    claimableBalance: (args: readonly [Hex]) => Promise<bigint>;
    isReceiptCredited: (args: readonly [Hex]) => Promise<boolean>;
    usdc: () => Promise<Hex>;
  };
  write: {
    attest: (args: readonly [Hex, Hex, string, string]) => Promise<Hex>;
    claimCreatorBalance: (args: readonly [bigint, Hex]) => Promise<Hex>;
    depositForAttestation: (args: readonly [Hex, Hex, bigint, Hex]) => Promise<Hex>;
    initializeVault: (args: readonly [Hex]) => Promise<Hex>;
  };
};

function registryContract(address: Hex, client: typeof publicClient | typeof walletClient): RegistryContract {
  return getContract({
    address,
    abi: attestationRegistryAbi,
    client,
  }) as unknown as RegistryContract;
}

/** 읽기 전용 컨트랙트 인스턴스 */
export const registryRead = registryContract(env.PROXY_ADDRESS as Hex, publicClient);

/** Vault 읽기 전용 컨트랙트 인스턴스 */
export const vaultRead = registryContract(env.VAULT_ADDRESS as Hex, publicClient);

/** 쓰기 전용 컨트랙트 인스턴스 (operator) */
export const registryWrite = registryContract(env.PROXY_ADDRESS as Hex, walletClient);

/** Vault 쓰기 전용 컨트랙트 인스턴스 */
export const vaultWrite = registryContract(env.VAULT_ADDRESS as Hex, walletClient);
