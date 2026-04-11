import { getContract } from "viem";
import { attestationRegistryAbi } from "./abi.js";
import { publicClient, walletClient } from "../config/chain.js";
import { env } from "../config/env.js";

// ABI는 소스 관리되는 정적 파일에서 로드 (Foundry 아티팩트 의존 제거)

/** 읽기 전용 컨트랙트 인스턴스 */
export const registryRead = getContract({
  address: env.PROXY_ADDRESS as `0x${string}`,
  abi: attestationRegistryAbi,
  client: publicClient,
});

/** 쓰기 전용 컨트랙트 인스턴스 (operator) */
export const registryWrite = getContract({
  address: env.PROXY_ADDRESS as `0x${string}`,
  abi: attestationRegistryAbi,
  client: walletClient,
});
