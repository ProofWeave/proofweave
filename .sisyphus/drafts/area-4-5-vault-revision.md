# Area #4 + #5 — Vault-Backed Claim Settlement

## Architecture Decision

- Receiver flow: x402 payment → Vault contract → Creator claim.
- This replaces the earlier S0/S1 operator-held accounting path. The current `api/src/middleware/x402Gate.ts` sends USDC from the buyer smart wallet to `operatorAccount.address`; S2 changes the economic sink to the Vault and makes Vault state, not mutable backend rows, the creator-balance source of truth.
- Keep the existing product vocabulary: x402 gate, CDP Smart Wallet, `X-Access-Receipt`, and smart-wallet outbound transfers. The semantic change is that the paid path must produce a Vault deposit keyed by a replay-safe `receiptRef` before a receipt grants plaintext access.

```mermaid
flowchart LR
  A[api/src/routes/attest.ts\npriceUsdMicros on upload] --> B[api/src/services/pricing.ts\npricing_policies]
  B --> C[api/src/middleware/x402Gate.ts\nquote/reserve/payment gate]
  C --> D[api/src/services/quote.ts\npayment_quotes + idempotency]
  C --> E[api/src/services/wallet.ts\nCDP Smart Wallet userOp]
  E --> F[USDC approve + Vault.deposit]
  F --> G[src/AttestationRegistry.sol\nVault module or PaymentVault ABI]
  G --> H[api/src/services/receipt.ts\naccess_receipts snapshot]
  H --> I[api/src/services/ledger.ts\nappend-only attribution ledger]
  H --> J[api/src/routes/attestations.ts\ndecrypt + deliver]
  G --> K[claim()/withdraw()\ncreator payout]
```

Important mechanical constraint: a bare ERC20 `transfer(vault, amount)` does not tell the Vault which creator to credit. Therefore “only change `payTo`” is insufficient unless payment execution becomes an approve + `deposit(creator, amount, receiptRef)` call, or the Vault supports a verified post-transfer attribution function. The safer MVP is one CDP user operation containing `USDC.approve(vault, amount)` followed by `Vault.deposit(creator, amount, receiptRef)`.

## Vault Contract Design

Assumption for this revision: because the existing onchain component is a UUPS proxy at `src/AttestationRegistry.sol`, the direct-S2 path appends a Vault module to the existing proxy implementation. Provenance functions stay unchanged; payment state is appended after `address public operator`. If the team later chooses a separate `src/PaymentVault.sol`, preserve the same ABI and deploy it as its own UUPS proxy, but do not pretend that existing `AttestationRegistry` storage can be reused across a new proxy.

Storage layout, appended only:

- `IERC20 public usdc;`
- `address public feeRecipient;`
- `uint16 public protocolFeeBps;`
- `bool public vaultPaused;`
- `uint256 private _vaultEntered;` for manual reentrancy guard without changing inherited storage order.
- `mapping(address => uint256) private _claimable;`
- `mapping(bytes32 => DepositRecord) private _deposits;`
- `mapping(address => uint256) private _refundable;` if refunds are claimable by payer.
- `struct DepositRecord { address payer; address creator; uint256 gross; uint256 fee; uint256 net; DepositStatus status; bytes32 attestationId; }`
- `enum DepositStatus { None, PendingDelivery, Finalized, Refunded }`

Use `reinitializer(2)` for `initializeVault(address usdc_, address feeRecipient_, uint16 feeBps_)`. Do not reorder `_attestations`, `_attestationByKey`, `_creatorAttestations`, or `operator`. Because the current contract has no explicit `__gap`, every appended slot consumes future upgrade flexibility; this is an audit item, not a formality.

Public functions:

- `deposit(address creator, uint256 amount, bytes32 receiptRef)` pulls USDC from `msg.sender` via `transferFrom`, computes fee/net, stores a unique pending deposit, and emits `PaymentDeposited`.
- `claim()` transfers the caller’s full finalized claimable balance to `msg.sender` and emits `Claimed`.
- `balanceOf(address creator)` returns finalized claimable USDC, not pending delivery funds.
- `withdraw(uint256 amount, address to)` lets a creator or creator smart wallet route part of its finalized balance to another address and emits `OutboundTransferred`.

The listed four functions are not enough for safe refunds. Add operator-only `finalizeDeposit(bytes32 receiptRef)` and `refund(bytes32 receiptRef, address payer)` or an equivalent two-phase mechanism. Without a finalization/refund hook, failed delivery after deposit either strands buyer funds or lets creators claim undelivered purchases.

Events: `PaymentDeposited(receiptRef, payer, creator, attestationId, gross, fee, net)`, `Claimed(creator, to, amount)`, `OutboundTransferred(creator, to, amount)`, plus `PaymentRefunded(receiptRef, payer, amount)` if refunds are implemented.

Invariants:

- A `receiptRef` is processed at most once onchain.
- `claimable[creator]` increases only from finalized deposits, never from mutable `pricing_policies`.
- `gross = protocolFee + creatorNet` and Vault USDC balance covers total claimable + refundable + fees.
- No receipt may be issued unless the matching Vault deposit exists and amount/creator/payTo match the quote snapshot.
- No creator can claim pending or refunded deposits.
- Pausing blocks new deposits and claims except emergency refunds, depending on the incident mode.

Reentrancy: apply checks-effects-interactions for `claim`, `withdraw`, and `refund`; use SafeERC20 and the appended `_vaultEntered` guard. Replay: `receiptRef = keccak256(chainId, vault, quoteId, payer, attestationId, creator, amount, currency, nonce)` and stored in `_deposits`. Signature/key rotation: backend receipt HMAC rotation must not affect Vault deposit replay keys; onchain `receiptRef` remains stable.

ERC20 handling: CDP smart wallet must approve the Vault for exactly `amount`, then call `deposit`. Avoid unlimited allowances. If x402 external clients cannot batch calls, expose payment requirements that specify `asset=USDC`, `payTo=vault`, and `call=deposit(creator, amount, receiptRef)` rather than only a transfer recipient.

Refund path: before payment, backend should preflight that encrypted payload exists and can be decrypted. After `deposit`, delivery may still fail due DB/IPFS/network errors. In that case the deposit remains `PendingDelivery`; backend does not issue an access receipt, then calls `refund(receiptRef, payer)` or marks buyer-refundable. If DB receipt write fails after deposit, retry with the same idempotency key must recover and issue the receipt, not refund by default.

## State Machine (Payment → Deposit → Receipt → Claim)

States: `priced → quote_issued → quote_reserved → vault_deposit_submitted → vault_deposit_finalized(PendingDelivery) → receipt_issued + ledger_written → delivery_succeeded → vault_finalized → claimable → claimed/withdrawn`. Failure branches: `quote_expired`, `reservation_conflict`, `deposit_failed`, `receipt_write_failed_retryable`, `delivery_failed_refund_required`, `refunded`.

Atomic requirements:

- Quote reservation must be atomic in Postgres before any user operation is submitted.
- The smart-wallet payment operation must atomically approve and call `deposit`; do not split approve and deposit across separate requests.
- Vault `deposit` must atomically pull USDC and write the deposit record.
- `access_receipts` and `payments_ledger` writes must remain one DB transaction.

Eventually consistent:

- Vault event indexing into a backend attribution ledger can lag, provided receipt issuance directly verifies the transaction receipt/log before delivery.
- UI balances can lag behind Vault `balanceOf`.
- Reconciliation jobs can repair missing DB rows from Vault events, but cannot invent claimable balances absent onchain events.

## Quote / Reservation

Quote binds: payer, attestation/artifact, creator, gross amount, protocol fee, creator net, currency, network, `payTo = VAULT_ADDRESS`, TTL, and `receiptRef`. Add these fields to `payment_quotes`; current schema only binds payer, attestation, amount, and TTL.

Two concurrent purchases with the same quote: first request transitions `quote_issued → quote_reserved` under `SELECT ... FOR UPDATE` and receives the right to submit the user operation. The second request with the same quote receives `409 reserved` unless it presents the same idempotency key and the first flow already produced a recoverable receipt/deposit. Expired-but-reserved quotes may complete only within a short deposit grace window; unreserved expired quotes cannot pay.

Idempotency key strategy: client sends or server assigns `X-Idempotency-Key`; backend derives `receiptRef`. Store `reserved_at`, `idempotency_key`, `vault_deposit_tx_hash`, `deposit_status`, `receipt_id`. Retrying the same idempotency key returns the existing quote/deposit/receipt state and never submits another payment.

## Backend changes

- `api/src/config/env.ts`: add `VAULT_ADDRESS`, `PROTOCOL_FEE_BPS`, and optional `FEE_RECIPIENT` validation.
- `api/src/services/wallet.ts`: replace `transferUsdcFromSmartWallet(smartWallet, operator, amount)` in paid-detail flow with `depositUsdcToVaultFromSmartWallet(smartWallet, vault, creator, amount, receiptRef)`. It should send a CDP user operation with two calls: USDC approve and Vault deposit. Keep the generic outbound-transfer helper for creator withdrawals if the creator is a CDP smart wallet.
- `api/src/middleware/x402Gate.ts`: 402 response `price.payTo` becomes `env.VAULT_ADDRESS`; paid path reserves quote before payment, snapshots `pricing.creatorAddress`, derives `receiptRef`, submits Vault deposit, verifies Vault event, then issues receipt. It must never pay `operatorAccount.address`.
- `api/src/services/receipt.ts` and `api/src/db/migrate.ts`: extend `access_receipts` with `vault_deposit_tx_hash`, `receipt_ref`, `creator_address`, `gross_price_usd_micros`, `protocol_fee_usd_micros`, `creator_net_usd_micros`, and `settlement_status`.
- `api/src/services/ledger.ts`: create append-only attribution ledger derived from Vault events, not pricing rows. Historical price changes must not alter attribution.
- `api/src/services/quote.ts`: add reservation, idempotency, payTo, creator, and fee fields.
- Refund/failed delivery: add a service that can reconcile `PendingDelivery` deposits and call Vault refund if no receipt was issued or delivery is impossible.

## Implementation Tasks (5-8 tasks)

1. **Vault module contract** — Files: `src/AttestationRegistry.sol`, `test/unit/Vault.t.sol`, `test/upgrade/UUPS.t.sol`. Agent: ultrabrain. Parallelizable: N. Blockers: final choice same proxy vs separate Vault. Blocks: all backend payment work. Acceptance: `forge test --match-contract Vault -vvv` proves deposit, duplicate receiptRef rejection, claim, withdraw, pause, refund, and UUPS storage preservation.

2. **Vault deployment and ABI wiring** — Files: `script/Deploy.s.sol` or new `script/UpgradeVault.s.sol`, `api/src/contracts/abi.ts`, `api/src/config/env.ts`, `.env.example`. Agent: deep. Parallelizable: Y after task 1 ABI stabilizes. Blocks: backend integration. Acceptance: dry-run deploy/upgrade prints Vault/proxy address; API boot fails if `VAULT_ADDRESS` invalid.

3. **Quote reservation schema** — Files: `api/src/db/migrate.ts`, `api/src/services/quote.ts`, `api/src/types/payment.ts`, `api/src/__tests__/x402Gate.test.ts`. Agent: unspecified-high. Parallelizable: Y. Blocks: x402 refactor. Acceptance: tests show concurrent reserve calls allow one winner and one `409` before any payment helper is called.

4. **Smart-wallet Vault deposit helper** — Files: `api/src/services/wallet.ts`, `api/src/config/env.ts`, `api/src/__tests__/e2e-payment.ts`. Agent: deep. Parallelizable: Y after ABI. Blocks: paid access. Acceptance: mocked CDP call contains USDC approve to Vault and Vault `deposit(creator, amount, receiptRef)`.

5. **x402Gate paid path refactor** — Files: `api/src/middleware/x402Gate.ts`, `api/src/services/receipt.ts`, `api/src/services/ledger.ts`, `api/src/__tests__/x402Gate.test.ts`. Agent: ultrabrain. Parallelizable: N. Blockers: tasks 2-4. Blocks: delivery/refund tests. Acceptance: paid request returns receipt with `creatorAddress`, `vaultDepositTxHash`, fee/net fields; no code path sends funds to `operatorAccount.address`.

6. **Claim and outbound APIs** — Files: `api/src/routes/wallet.ts` or new `api/src/routes/claims.ts`, `api/src/index.ts`, `api/src/services/wallet.ts`. Agent: quick. Parallelizable: Y after task 1. Blocks: UI. Acceptance: curl can read Vault `balanceOf` and submit claim/withdraw for a CDP smart wallet in test mode.

7. **Refund and reconciliation service** — Files: `api/src/services/vaultReconciliation.ts`, `api/src/db/migrate.ts`, `api/src/routes/health.ts`, tests. Agent: deep. Parallelizable: Y after tasks 1 and 5. Blocks: production readiness. Acceptance: a simulated deposit followed by DB failure is recovered into a receipt; a simulated undeliverable artifact is marked refund-required and does not become claimable.

8. **Security pass** — Files: contract tests, `api/src/__tests__/x402Gate.test.ts`, README/payment docs. Agent: unspecified-high. Parallelizable: N. Blockers: tasks 1-7. Acceptance: documented threat model covers stuck funds, replay, quote races, failed delivery, and upgrade pause; all forge/API tests pass.

## Risks From Skipping S0/S1

- Funds can be stuck if the Vault has a bug; operator manual correction is no longer a simple database or EOA transfer fix.
- Audit-before-deploy is mandatory. Direct S2 puts user funds into new contract logic that combines upgradeability, ERC20 custody, and replay protection.
- Emergency plan must exist: pause deposits, optionally pause claims, allow refunds for pending deposits, and define who can upgrade.
- Existing receipts are not automatically claimable. Current `payments_ledger` entries sent funds to operator, not Vault, so migration requires either manual Vault funding plus synthetic deposit records or marking them legacy/operator-settled.
- Same-proxy upgrade risk is higher because `AttestationRegistry.sol` has no storage gap. A separate Vault proxy reduces storage risk but adds cross-contract configuration.
- External x402 compatibility may suffer if clients expect a plain ERC20 transfer to `payTo`; this design needs a contract call or a facilitator that can execute approve + deposit.

## Open Questions (for user)

- Should Vault live inside the existing `AttestationRegistry` UUPS proxy, or as a separate `PaymentVault.sol` UUPS proxy referenced by the API?
- What protocol fee bps and fee recipient should be used for MVP?
- Who has authority to pause, refund pending deposits, and upgrade the Vault?
- Are legacy operator-paid receipts migrated into Vault claimable balances, or labeled pre-Vault and excluded from claim?
- Should creators claim only to their registered creator address, or can they withdraw to any `to` address?
- Is external x402 facilitator compatibility required now, or is CDP smart-wallet approve + deposit sufficient for MVP?
