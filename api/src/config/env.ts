import { z } from "zod";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { loadSecretsFromKeychain } from "./keychain.js";

// 루트 .env 파일 로드 (공개값만 포함)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../../../.env");
config({ path: envPath });

// ── Keychain에서 비밀값 로드 ────────────────────────────────
// .env에 없는 비밀값을 macOS Keychain에서 읽어 process.env에 주입
// CI/Docker에서는 process.env에 직접 설정하므로 Keychain 단계 스킵됨
loadSecretsFromKeychain([
  "DEPLOYER_PRIVATE_KEY",
  "OPERATOR_PRIVATE_KEY",
  "PINATA_JWT",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CDP_WALLET_SECRET",
  "RECEIPT_SECRET",
  "DATA_ENCRYPTION_KEY",
]);

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

  // Coinbase CDP (Smart Wallet 생성용)
  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  CDP_WALLET_SECRET: z.string().optional(),

  // Receipt HMAC 서명 시크릿 (openssl rand -hex 32)
  RECEIPT_SECRET: z.string().min(32, "RECEIPT_SECRET must be at least 32 chars").optional(),

  // 데이터 암호화 마스터 키 (openssl rand -hex 32, HKDF 파생용)
  DATA_ENCRYPTION_KEY: z.string().length(64, "DATA_ENCRYPTION_KEY must be 64 hex chars (32 bytes)").optional(),

  // Supabase Auth
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Gemini (LLM 호출용)
  GEMINI_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
