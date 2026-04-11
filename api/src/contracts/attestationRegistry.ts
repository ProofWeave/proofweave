import { getContract } from "viem";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { publicClient, walletClient } from "../config/chain.js";
import { env } from "../config/env.js";

// Foundry 빌드 아티팩트에서 ABI 직접 로드
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const artifactPath = resolve(
  __dirname,
  "../../../out/AttestationRegistry.sol/AttestationRegistry.json"
);
const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
export const attestationRegistryAbi = artifact.abi;

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
