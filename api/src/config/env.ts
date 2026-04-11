import { z } from "zod";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// 루트 .env 파일 로드 (api/src/config/ → 3단계 상위 = proofweave/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../../../.env");
config({ path: envPath });

// ── 커스텀 검증 헬퍼 ────────────────────────────────────────
const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid 40-char hex address");

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Must be a valid 64-char hex private key");

// ── 환경변수 스키마 ─────────────────────────────────────────
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Chain
  BASE_SEPOLIA_RPC_URL: z.string().url("Invalid RPC URL"),

  // Keys — deployer와 operator 분리
  DEPLOYER_PRIVATE_KEY: hexPrivateKey,
  OPERATOR_PRIVATE_KEY: hexPrivateKey.optional(), // 없으면 DEPLOYER_PRIVATE_KEY 사용

  // Addresses
  OWNER_ADDRESS: hexAddress,
  OPERATOR_ADDRESS: hexAddress,

  // Contract (배포된 Proxy 주소)
  PROXY_ADDRESS: hexAddress.default("0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E"),

  // IPFS
  PINATA_JWT: z.string().min(1, "PINATA_JWT is required"),
  PINATA_GATEWAY: z.string().min(1, "PINATA_GATEWAY is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
