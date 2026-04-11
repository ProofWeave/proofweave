import { z } from "zod";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// 루트 .env 파일 로드 (api/src/config/ → 3단계 상위 = proofweave/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../../../.env");
config({ path: envPath });

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Chain
  BASE_SEPOLIA_RPC_URL: z.string().url("Invalid RPC URL"),
  DEPLOYER_PRIVATE_KEY: z.string().startsWith("0x", "Private key must start with 0x"),
  OWNER_ADDRESS: z.string().startsWith("0x", "Owner address must start with 0x"),
  OPERATOR_ADDRESS: z.string().startsWith("0x", "Operator address must start with 0x"),

  // Contract (배포된 Proxy 주소)
  PROXY_ADDRESS: z
    .string()
    .startsWith("0x")
    .default("0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E"),

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
