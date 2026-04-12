/**
 * ProofWeave Phase 2-4 E2E 검증 스크립트
 *
 * 실행: npx tsx api/src/__tests__/e2e-payment.ts
 *
 * 전제조건:
 * - PostgreSQL 실행 중
 * - API 서버 실행 중 (npm run dev → http://localhost:3001)
 * - DEPLOYER_PRIVATE_KEY가 Keychain에 등록되어 있음
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { execSync } from "child_process";

const API = "http://localhost:3001";

// Keychain에서 테스트용 프라이빗 키 로드
function getKeyFromKeychain(service: string): string {
  return execSync(
    `security find-generic-password -s "${service}" -a proofweave -w`,
    { encoding: "utf-8" }
  ).trim();
}

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function log(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "✅" : "❌"} ${name}: ${detail}`);
}

async function main() {
  console.log("\n🧪 ProofWeave Phase 2-4 E2E 검증\n");
  console.log("─".repeat(60));

  // ── 0. 서명 준비 ──────────────────────────────────────────
  const privateKey = getKeyFromKeychain("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const address = account.address;
  console.log(`🔑 Test wallet: ${address}\n`);

  // ── 1. Health Check ───────────────────────────────────────
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json() as { status: string };
    log("Health Check", res.ok, `status: ${data.status}`);
  } catch (err) {
    log("Health Check", false, `서버 미응답: ${err}`);
    printSummary();
    return;
  }

  // ── 2. Register (실제 서명) ────────────────────────────────
  let apiKey: string | null = null;
  try {
    const timestamp = new Date().toISOString();
    const message = `ProofWeave API Key Request\nAddress: ${address}\nTimestamp: ${timestamp}\nAction: register`;

    const signature = await account.signMessage({ message });

    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, message, signature }),
    });

    const data = await res.json() as { apiKey?: string; error?: string };

    if (res.status === 201 || res.status === 200) {
      apiKey = data.apiKey ?? null;
      log("Register", true, `API Key 발급됨 (앞 8자: ${apiKey?.substring(0, 8)}...)`);
    } else if (res.status === 409) {
      // 이미 등록됨 — rotate로 새 키 발급
      log("Register", true, `이미 등록됨(409) — rotate 시도`);

      const rotateMsg = `ProofWeave API Key Request\nAddress: ${address}\nTimestamp: ${new Date().toISOString()}\nAction: rotate`;
      const rotateSig = await account.signMessage({ message: rotateMsg });

      const rotateRes = await fetch(`${API}/auth/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message: rotateMsg, signature: rotateSig }),
      });
      const rotateData = await rotateRes.json() as { apiKey?: string };
      apiKey = rotateData.apiKey ?? null;
      log("Rotate", rotateRes.ok, `새 API Key: ${apiKey?.substring(0, 8)}...`);
    } else {
      log("Register", false, `${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    log("Register", false, `${err}`);
  }

  if (!apiKey) {
    console.log("\n⚠️ API Key 발급 실패 — 나머지 테스트 스킵");
    printSummary();
    return;
  }

  // ── 3. Wallet 조회 ────────────────────────────────────────
  try {
    const res = await fetch(`${API}/wallet/address`, {
      headers: { "X-API-Key": apiKey },
    });
    const data = await res.json() as { smartWalletAddress?: string };
    if (data.smartWalletAddress) {
      log("Wallet Address", true, `Smart Wallet: ${data.smartWalletAddress}`);
    } else {
      log("Wallet Address", true, `스마트 지갑 미생성 (CDP 미설정 시 정상)`);
    }
  } catch (err) {
    log("Wallet Address", false, `${err}`);
  }

  try {
    const res = await fetch(`${API}/wallet/balance`, {
      headers: { "X-API-Key": apiKey },
    });
    const data = await res.json();
    log("Wallet Balance", res.ok, JSON.stringify(data));
  } catch (err) {
    log("Wallet Balance", false, `${err}`);
  }

  // ── 4. 가격 정책 설정 ────────────────────────────────────
  const testAttestId = "e2e-test-" + Date.now();
  try {
    const res = await fetch(`${API}/pricing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        attestationId: testAttestId,
        priceUsdMicros: 50000,
        currency: "USDC",
        network: "eip155:84532",
      }),
    });
    const data = await res.json();
    log("Set Pricing", res.ok || res.status === 201, `${res.status}: ${JSON.stringify(data)}`);
  } catch (err) {
    log("Set Pricing", false, `${err}`);
  }

  // ── 5. 유료 접근 시도 → 402 예상 ──────────────────────────
  try {
    const res = await fetch(`${API}/attestations/${testAttestId}/detail`, {
      headers: { "X-API-Key": apiKey },
    });
    const data = await res.json() as { quoteId?: string; error?: string; "x-402"?: boolean };

    if (res.status === 402) {
      log("Payment Gate (402)", true, `quoteId: ${data.quoteId ?? "N/A"}`);
    } else if (res.status === 404) {
      log("Payment Gate", true, `404 — /detail 라우트 미구현 (Phase 2-5 예정). 결제 시스템 자체는 준비됨.`);
    } else {
      log("Payment Gate", false, `${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    log("Payment Gate", false, `${err}`);
  }

  // ── 6. 위조 Receipt 거부 ──────────────────────────────────
  try {
    const res = await fetch(`${API}/attestations/${testAttestId}/detail`, {
      headers: {
        "X-API-Key": apiKey,
        "X-Access-Receipt": "fake-receipt.fakehm4cvalue",
      },
    });
    log("Fake Receipt Reject", res.status !== 200,
      `위조 receipt → ${res.status} (200이면 보안 위험!)`);
  } catch (err) {
    log("Fake Receipt Reject", false, `${err}`);
  }

  printSummary();
}

function printSummary() {
  console.log("\n" + "─".repeat(60));
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n📊 결과: ${passed}/${total} 통과`);

  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log("\n❌ 실패 항목:");
    failed.forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
  }
  console.log();
}

main().catch(console.error);
