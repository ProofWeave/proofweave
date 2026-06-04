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
    } else {
      // 따옴표 없는 값: 인라인 주석(공백+#) 제거.
      // (이걸 안 하면 "KEY=값  # 주석" 의 주석이 값에 섞여 들어가 JWT 등이 무효화됨 —
      //  실제로 SUPABASE_SERVICE_ROLE_KEY 에 주석이 붙어 인증이 전부 깨진 적 있음)
      const commentIdx = value.search(/\s#/);
      if (commentIdx >= 0) value = value.slice(0, commentIdx);
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

// 우선순위: .env(localEnv) > process.env > Keychain.
//   process.env 를 베이스로 깔되, .env 가 있으면 .env 가 이긴다.
//   (배포 shell 에 우연히 export 된 무효 값이 .env 의 정식 값을 덮어쓰는 사고 방지 —
//    실제로 무효한 SUPABASE_SERVICE_ROLE_KEY 가 주입돼 인증이 전부 깨진 적 있음)
const finalEnv = {};
for (const [k, v] of Object.entries(process.env)) {
  if (v) finalEnv[k] = v;
}
for (const [k, v] of Object.entries(localEnv)) {
  if (v) finalEnv[k] = v; // .env 가 process.env 를 덮어쓴다 (소스 오브 트루스)
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
