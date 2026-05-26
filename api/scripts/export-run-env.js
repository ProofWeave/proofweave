import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드
const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const localEnv = {};

// 간단한 dotenv 파서
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    localEnv[key] = value.trim();
  }
});

// Keychain에서 비밀값 읽기
const KEYCHAIN_ACCOUNT = "proofweave";
const secretKeys = [
  "DEPLOYER_PRIVATE_KEY",
  "OPERATOR_PRIVATE_KEY",
  "PINATA_JWT",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CDP_WALLET_SECRET",
  "RECEIPT_SECRET",
  "DATA_ENCRYPTION_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY"
];

const finalEnv = { ...localEnv };

// process.env 에 있는 것도 병합
for (const [k, v] of Object.entries(process.env)) {
  if (v) finalEnv[k] = v;
}

// Keychain 탐색
for (const key of secretKeys) {
  if (!finalEnv[key]) {
    try {
      const val = execSync(
        `security find-generic-password -s "${key}" -a "${KEYCHAIN_ACCOUNT}" -w`,
        { encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      if (val) {
        finalEnv[key] = val;
      }
    } catch (e) {
      // Keychain 실패 시 그냥 넘어감
    }
  }
}

// 획득해야 할 전체 Cloud Run 주입용 키 목록
const requiredKeys = [
  "DATABASE_URL",
  "BASE_SEPOLIA_RPC_URL",
  "DEPLOYER_PRIVATE_KEY",
  "OPERATOR_PRIVATE_KEY",
  "OWNER_ADDRESS",
  "OPERATOR_ADDRESS",
  "PROXY_ADDRESS",
  "VAULT_ADDRESS",
  "PINATA_JWT",
  "PINATA_GATEWAY",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CDP_WALLET_SECRET",
  "RECEIPT_SECRET",
  "DATA_ENCRYPTION_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "TAINT_GUARD_URL",
  "NODE_ENV"
];

const envVars = [];
for (const key of requiredKeys) {
  const val = finalEnv[key];
  if (val) {
    envVars.push(`${key}=${val}`);
  }
}

console.log(envVars.join(','));
