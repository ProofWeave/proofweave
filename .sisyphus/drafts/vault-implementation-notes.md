## 2026-05-15 — Vault-direct creator settlement

- Appended vault storage to `AttestationRegistry` after the existing UUPS storage (`operator`) only: USDC token, creator claimable balances, credited receipt refs, and a manual reentrancy guard.
- Implemented contract-level attribution through `depositForAttestation(attestationId, creator, amount, receiptRef)`. The function checks the onchain attestation creator before crediting, so the backend passes `pricing_policies.creator_address` but cannot redirect settlement to a different creator if the row is stale or tampered.
- Paid API access now uses a CDP Smart Wallet user operation containing `USDC.approve(PROXY_ADDRESS, amount)` plus `AttestationRegistry.depositForAttestation(...)`; `operatorAccount.address` is no longer the paid receiver for `x402Gate`.
- Receipts and ledger rows now carry reconciliation fields: `creator_address`, `vault_address`, `vault_tx_hash`, `vault_receipt_ref`, and `claimable_amount_usd_micros`. `vault_receipt_ref` has partial unique indexes for DB-side replay/idempotency checks, while the contract enforces replay prevention onchain.
- Verification completed: focused vault tests, full `forge test`, related payment Vitest files, TypeScript diagnostics, and `api` `npm run build` all pass. Solidity LSP diagnostics could not run because no `.sol` language server is configured in this environment.

## 2026-05-15 — Review hardening fixes

- Post-implementation review found backend idempotency needed hardening. `x402Gate` now treats `vault_receipt_ref` as the payment identity instead of trusting `tx_hash` alone, because ERC-4337 transaction hashes may not uniquely identify one payment. Direct no-quote payments now use a deterministic payer/attestation/creator/amount receiptRef instead of a random one.
- Added a pre-deposit reusable receipt lookup by scoped `vault_receipt_ref` so retries with the same payment identity can reuse the existing access receipt before attempting another vault deposit.
- Added the missing guarded `api_keys.eoa_address` migration required by the CDP smart-wallet owner lookup path.
- Updated the static TypeScript contract ABI with the new vault functions/events/errors so contract wrappers are not stale after the Solidity upgrade.
- Re-verified after fixes: TypeScript diagnostics clean on modified API files, full `forge test` passes, related payment Vitest files pass, and `api` `npm run build` passes. The larger static ABI required explicit `any` casts at the `registryRead`/`registryWrite` wrapper export boundary to avoid TypeScript declaration serialization limits while preserving runtime behavior.
