# ProofWeave Implementation Runbook

This runbook records the safe local and staging checks for the current implementation cycle. Commands that mutate Base Sepolia, Supabase, or paid CDP flows should be run manually by the project owner.

## 1. Local verification

```bash
forge build --offline
forge test --offline --match-contract Vault
npm --prefix api run build
npm --prefix api test -- x402Gate.test.ts wallet.service.test.ts reputation.service.test.ts
npm --prefix web run build
npm --prefix cli run build
npm --prefix experiments/token-efficiency run typecheck
npm --prefix experiments/token-efficiency run phase1
```

Expected results:

- Foundry build succeeds.
- Vault tests pass.
- API TypeScript build succeeds.
- Payment/reputation unit tests pass.
- Web Vite build succeeds.
- CLI build succeeds.
- Token phase1 writes `summary.md` and `summary.json` under `experiments/token-efficiency/outputs/runs/<timestamp>/`.

## 2. Vault deployment evidence

Current Base Sepolia addresses:

```text
PROXY_ADDRESS=0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E
VAULT_ADDRESS=0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E
IMPLEMENTATION_ADDRESS=0x11c86A6f5110727Bf9A8a19aE4F09C24141438C5
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Verify vault state:

```bash
cast call "$PROXY_ADDRESS" "usdc()(address)" --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast storage "$PROXY_ADDRESS" \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
  --rpc-url "$BASE_SEPOLIA_RPC_URL"
cast call "$PROXY_ADDRESS" "claimableBalance(address)(uint256)" "$OWNER_ADDRESS" --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

Permanent evidence lives in `docs/evidence/vault-deploy/2026-05-25-base-sepolia.md`.

## 3. Supabase migration

Run these files in Supabase SQL Editor or through Supabase CLI in this order:

```text
supabase/migrations/20260525_vault_settlement.sql
supabase/migrations/20260525_reputation_logs.sql
```

Then verify:

```text
supabase/verify/verify_vault_settlement.sql
supabase/verify/verify_reputation_logs.sql
```

Expected result: all status rows report `ok`; the reputation verification block completes without raising `duplicate reputation insert was not blocked`.

## 4. CDP payment smoke

Do not claim real payment completion until this produces a Base Sepolia transaction hash and a matching `VaultDeposited` event.

```bash
PROOFWEAVE_API_KEY="pw_..." \
npx tsx api/scripts/smoke-cdp-vault-payment.ts \
  --network base-sepolia \
  --api-base-url http://localhost:3001 \
  --attestation-id <paid-attestation-id>
```

Evidence to capture:

- UserOperation transaction hash
- `VaultDeposited(receiptRef, attestationId, creator, payer, amount)` event
- `X-Access-Receipt` response header
- `access_receipts.vault_receipt_ref` row
- `payments_ledger.vault_receipt_ref` row

## 5. CLI harness

```bash
npm --prefix cli run build
node cli/dist/index.js install --target claude-code --scope project --dry-run
node cli/dist/index.js publish cli/README.md --dry-run --price-usd-micros 100000 --usage-event-id sample-event
node cli/dist/index.js doctor
```

`doctor` exits non-zero if local config, API reachability, or API key presence fails.

## 6. Known tooling notes

- Local Foundry is a nightly build and emits a warning. Use `--offline` for local compile/test checks to avoid installer/network instability.
- CSS LSP diagnostics may fail if the optional `biome` language server is not installed. `npm --prefix web run build` is the authoritative CSS/TSX verification for this cycle.
- Do not commit Foundry `cache/` files; they can contain sensitive values.
