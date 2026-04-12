import { privateKeyToAccount } from "viem/accounts";
import { execSync } from "child_process";

async function main() {
  const pk = execSync(
    'security find-generic-password -s DEPLOYER_PRIVATE_KEY -a proofweave -w',
    { encoding: "utf-8" }
  ).trim();

  const account = privateKeyToAccount(pk as `0x${string}`);
  const ts = new Date().toISOString();
  const msg = `ProofWeave API Key Request\nAddress: ${account.address}\nTimestamp: ${ts}\nAction: rotate`;
  const sig = await account.signMessage({ message: msg });

  const res = await fetch("http://localhost:3001/auth/rotate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address, message: msg, signature: sig }),
  });

  const data = await res.json();
  console.log("\n=== 새 API Key ===");
  console.log(data.apiKey);
  console.log("\n사용법:");
  console.log(`curl -s http://localhost:3001/wallet/address -H "X-API-Key: ${data.apiKey}" | jq .`);
}

main().catch(console.error);
