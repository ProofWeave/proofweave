# ProofWeave Evolution — Vault-Direct + Claude Code Harness V1

## TL;DR
> **Quick Summary**: ProofWeave V1 introduces Claude Code hook harness as primary surface, with x402 payments routed to a Vault contract for creator claim, instrumented token-efficiency measurement, hardened payment/listing state machines, layered security around the new trust boundary, and a composite (EIP-8004 ⊕ web-rating) ranking signal feeding listing kinds (prompt/skill/recipe).
> **Deliverables**: Vault contract + claim flow; Claude Code hook harness (npm pkg); receipt-bound payment state machine; rating + composite ranking; security hardening; instrumented token-savings reporting.
> **Estimated Effort**: Large (multi-wave, 4-6 weeks)
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: Vault contract → x402 receiver swap → CLI publish/buy → ranking → stats

---

## Context

### Original Request
The original request had seven areas: #1 token-efficiency testing, #2 prompt guard, #3 CLI + LLM-web integration, #4 payment upgrade, #5 user settlement contract / smart-wallet outbound, #6 security audit + fixes, and #7 niche-data feedback. The user later locked scope: #2 is excluded because the teammate prompt guard is not deployed server-side; #7 is no longer only directional and is merged with reputation/ranking as an implementation track; #1, #3, #4, #5, and #6 remain implementation-level.

### Interview Summary
The user accepted several overrides to the adversarial synthesis. First, payment should pivot from operator-held S0 to direct Vault-backed settlement in V1: x402/CDP payment must reach a Vault contract before receipt-gated access and creator claim. Second, product vocabulary may still say x402, CDP Smart Wallet, and access receipt, but the receiver semantics change from operator address to Vault deposit. Third, the primary user surface is not a standalone CLI; it is a Claude Code hook harness distributed through npm, with the CLI as transport. Fourth, the ranking system should combine EIP-8004 where available with receipt-gated web ratings and measured token savings, while degrading gracefully when EIP-8004 is unavailable.

### Adversarial Review
Critics challenged the vault-direct pivot because it skips the safer operator-held/manual-payout learning path and introduces contract custody, upgrade, refund, and audit risk immediately. The user accepted this with an audit/security requirement. Artistry's CLI-first reframe was accepted but narrowed into a Claude Code hook harness rather than a generic CLI product. High-skeptic and ultra-logic warned that token savings and ranking become fraud accelerants if they use synthetic data, unbound receipts, or opaque scores. Deep warned that the new trust boundary includes Vault custody, server decrypt/delivery, npm hook execution in the user's terminal, and reputation abuse.

---

## Work Objectives

### Core Objective
Ship V1 of ProofWeave that: (1) routes x402/CDP smart-wallet payments to a Vault contract, (2) lets creators claim from Vault state, (3) ships a Claude Code hook harness as the first dev-facing surface, (4) measures token savings honestly from hook + receipt data, (5) hardens security around Vault, delivery, and local hooks, and (6) introduces composite ranking using receipt-gated web ratings plus optional EIP-8004.

### Concrete Deliverables
- Vault-backed payment/claim module or separate PaymentVault with Foundry tests and deployment wiring.
- API payment path that reserves quotes, submits approve + Vault deposit, verifies Vault event, then issues access receipt.
- Receipt, ledger, quote, refund, and reconciliation schema updates with immutable payment snapshots.
- Claude Code hook harness npm package with install/uninstall, auth, discovery skill, buy/install-artifact, local receipts, telemetry, and doctor command.
- Artifact validation for structured JSON plus non-executable SKILL.md/prompt documents only.
- Hook-side token-efficiency instrumentation and canonical savings report endpoint.
- Receipt-gated web ratings, listing kinds, composite ranking, EIP-8004 feature flag/stub, and ranking UI explanation.
- Security controls for Vault, upgrade governance, API delivery, local credentials, supply chain, abuse, and rating manipulation.

### Definition of Done
- Foundry tests prove Vault deposit, duplicate receiptRef rejection, claim/withdraw, refund, pause, fee accounting, and upgrade storage safety.
- API tests prove quote reservation prevents concurrent double-payment and no paid path sends funds to `operatorAccount.address`.
- A paid artifact can be published, quoted, purchased through the Claude Code harness, deposited into Vault, receipt-issued, delivered, installed, rated, reflected in stats, and claimed by the creator on Base Sepolia.
- Token-savings reports include failed purchases, retries, fallback events, quality failures, sample sizes, and confidence intervals.
- Security review artifacts and QA evidence are saved under `.sisyphus/evidence/` by task.

### Must Have
- Vault as the payment sink/source of creator claim truth in V1.
- Replay-safe `receiptRef` binding quote, payer, artifact, creator, amount, network, Vault, and nonce.
- Quote reservation before payment submission or a durable idempotency key with equivalent safety.
- Receipt issuance only after matching Vault deposit is confirmed.
- Claude Code command-type hooks only; fail-open behavior for hook errors.
- Human purchase confirmation and local policy limits for paid purchases in V1.
- Receipt-gated ratings only; no anonymous public likes.
- EIP-8004 graceful degradation; missing external reputation is neutral.
- No arbitrary executable artifacts; `SKILL.md` is text, not runnable code.

### Must NOT Have (Guardrails)
- No operator-custodial accounting in V1 (user pivot).
- No standalone CLI product framing (must be harness).
- No EIP-8004 hard dependency (graceful degradation required).
- No support for arbitrary executable artifacts in V1.
- No marketing-grade "90% savings" claim without paired benchmarks.
- No Claude Code / Codex / MCP integration beyond Claude Code hooks in V1.
- No unbounded batch payouts or creator iteration in Vault.
- No broad USDC allowances; exact approve + deposit only if approval is required.
- No silent npm auto-update in the hook harness.
- No rating or ranking influence from non-purchasers.

---

## Verification Strategy
TDD is mandatory for contract custody, payment state machines, and ranking eligibility because failures can either move funds incorrectly or amplify fraud. Each implementation task includes QA scenarios with machine-checkable commands. Contract tasks use Foundry tests. API tasks use Vitest and curl-based local flows. Web/UI tasks use Playwright or component-level checks where applicable. Hook harness tasks use fixture-based command invocation plus a temp home directory so install/uninstall, local config permissions, receipts, and SQLite telemetry are reproducible.

---

## Execution Strategy (6 waves)
Wave 1 establishes the Vault contract, deployment wiring, and security model because every payment, receipt, and claim path depends on the receiver ABI. Wave 2 rewires API quote/payment/receipt/reconciliation to Vault as the source of payment truth. Wave 3 builds the Claude Code hook harness on top of stable API contracts. Wave 4 adds listing kinds, ratings, EIP-8004 stubs, and composite ranking. Wave 5 instruments token-efficiency measurement through the harness and canonical backend reports. Wave 6 performs hardening, security review, end-to-end QA, and release readiness.

---

## TODOs

### Wave 1 — Vault Contract + Governance Foundation

#### W1-T1 — Vault architecture boundary and ABI freeze
- **What to do**: Convert the vault-direct pivot into an implementation ADR and ABI contract. Default to a separate UUPS `PaymentVault` unless the user explicitly chooses same-proxy upgrade; define `deposit`, `finalizeDeposit`, `refund`, `claim`, `withdraw`, `balanceOf`, events, `receiptRef`, fee model, and AttestationRegistry boundary. State that `src/AttestationRegistry.sol` remains provenance-only unless the same-proxy option is explicitly selected.
- **Must NOT do**: Do not silently append payment state to `AttestationRegistry.sol` without a storage-layout decision. Do not treat a bare USDC transfer to Vault as sufficient attribution.
- **Recommended Agent Profile**: `ultrabrain` + Solidity architecture; this task needs storage-layout and settlement-invariant reasoning.
- **Parallelization**: Wave 1; blocks W1-T2, W1-T3, W2-T6, W2-T7; blocked by none.
- **References**: `src/AttestationRegistry.sol`, `test/upgrade/UUPS.t.sol`, `test/helpers/TestSetup.sol`, `script/Deploy.s.sol`.
- **Acceptance Criteria**: ADR names chosen deployment model, exact ABI, event schema, storage assumptions, pause/refund authority, and receiptRef derivation; ADR explicitly rejects operator-address payment for V1.
- **QA Scenarios**: Run `forge inspect AttestationRegistry storageLayout > .sisyphus/evidence/w1-t1-storage-layout.txt`; save ADR review checklist to `.sisyphus/evidence/w1-t1-adr.md`.
- **Commit message**: `plan vault architecture boundary and abi`

#### W1-T2 — Implement Vault deposit/claim/refund contract path
- **What to do**: Implement the chosen Vault path with exact-amount USDC custody, fee/net accounting, duplicate `receiptRef` rejection, pending delivery, finalization, refund, claim, withdraw, pause controls, SafeERC20, and reentrancy protection. Add Foundry tests for success and failure branches.
- **Must NOT do**: Do not add unbounded batch payouts. Do not allow creators to claim pending or refunded deposits. Do not introduce broad operator withdrawal power.
- **Recommended Agent Profile**: `ultrabrain` + Solidity/security; contract custody and invariants are the critical path.
- **Parallelization**: Wave 1; blocks W1-T3, W2-T6, W2-T7, W2-T8; blocked by W1-T1.
- **References**: `src/AttestationRegistry.sol`, `test/unit/Attest.t.sol`, `test/unit/AccessControl.t.sol`, `test/upgrade/UUPS.t.sol`, `test/helpers/TestSetup.sol`.
- **Acceptance Criteria**: `forge test` covers deposit, duplicate receiptRef, fee/net split, finalize, refund, claim, withdraw, pause, reentrancy attempt, failed token transfer, and UUPS storage preservation.
- **QA Scenarios**: Run `forge test --match-contract Vault -vvv | tee .sisyphus/evidence/w1-t2-vault-tests.log` and `forge test --match-path test/upgrade/UUPS.t.sol -vvv | tee .sisyphus/evidence/w1-t2-upgrade.log`.
- **Commit message**: `add vault deposit claim refund contract`

#### W1-T3 — Wire Vault deployment, ABI, and environment validation
- **What to do**: Add deployment/upgrade wiring for the Vault decision, update API ABI/config references, add `VAULT_ADDRESS`, `PROTOCOL_FEE_BPS`, and `FEE_RECIPIENT` validation, and ensure the API fails fast when Vault config is invalid.
- **Must NOT do**: Do not hardcode Sepolia addresses in source. Do not let API boot with missing Vault config on paid routes.
- **Recommended Agent Profile**: `deep` + deployment/backend config; this crosses Foundry deploy scripts and API environment safety.
- **Parallelization**: Wave 1; can proceed after W1-T1 ABI draft, finalizes after W1-T2; blocks W2-T6 and W2-T7.
- **References**: `script/Deploy.s.sol`, `api/src/contracts/abi.ts`, `api/src/contracts/attestationRegistry.ts`, `api/src/config/env.ts`, `.env.example`, `api/package.json`.
- **Acceptance Criteria**: Deploy/upgrade dry-run prints Vault/proxy address; `npm --prefix api run build` fails if required Vault env is invalid and succeeds with valid test values.
- **QA Scenarios**: Run deploy dry-run command and save transcript to `.sisyphus/evidence/w1-t3-deploy-dry-run.log`; run `npm --prefix api run build | tee .sisyphus/evidence/w1-t3-api-build.log`.
- **Commit message**: `wire vault deployment and api env`

#### W1-T4 — Add Vault governance and emergency controls plan
- **What to do**: Define Sepolia and mainnet governance posture: pause authority, refund authority, upgrade authority, timelock/multisig requirement, audit requirement before mainnet, incident response, and storage-layout review. Implement only the minimal contract/config hooks required for those controls.
- **Must NOT do**: Do not launch mainnet Vault without audit gate. Do not add emergency functions that can drain finalized creator balances.
- **Recommended Agent Profile**: `deep` + security/governance; this task translates security critique into operational controls.
- **Parallelization**: Wave 1; can run alongside W1-T2; blocks Wave 6 security signoff.
- **References**: `src/AttestationRegistry.sol`, `script/Deploy.s.sol`, `README.md`, `foundry.toml`.
- **Acceptance Criteria**: Governance doc names all privileged roles and permissions; tests prove pause behavior; README/payment docs state Sepolia/mainnet distinction and audit requirement.
- **QA Scenarios**: Run pause/refund tests and save to `.sisyphus/evidence/w1-t4-governance-tests.log`; save role matrix to `.sisyphus/evidence/w1-t4-role-matrix.md`.
- **Commit message**: `define vault governance and emergency controls`

### Wave 2 — Quote, Payment, Receipt, and Reconciliation

#### W2-T5 — Extend quote schema and reserve before payment
- **What to do**: Extend quote/payment schema so each quote binds payer, artifact/attestation, creator, gross amount, protocol fee, creator net, currency, network, `payTo = VAULT_ADDRESS`, TTL, idempotency key, and `receiptRef`. Implement atomic reservation before any user operation is submitted.
- **Must NOT do**: Do not submit CDP user operations before quote reservation. Do not allow expired unreserved quotes to pay. Do not derive settlement from mutable pricing rows after payment.
- **Recommended Agent Profile**: `unspecified-high` + backend concurrency; this requires DB transaction discipline and race tests.
- **Parallelization**: Wave 2; blocks W2-T7; blocked by W1-T1, W1-T3.
- **References**: `api/src/db/migrate.ts`, `api/src/services/quote.ts`, `api/src/types/payment.ts`, `api/src/__tests__/x402Gate.test.ts`, `api/src/services/pricing.ts`.
- **Acceptance Criteria**: Concurrent reserve attempts produce one reserved quote and one `409`; retry with same idempotency key returns existing state; quote snapshot contains creator/payTo/fee/net fields.
- **QA Scenarios**: Run `npm --prefix api test -- x402Gate.test.ts | tee .sisyphus/evidence/w2-t5-quote-tests.log`; include a concurrency test transcript in `.sisyphus/evidence/w2-t5-concurrency.md`.
- **Commit message**: `add vault-bound quote reservation`

#### W2-T6 — Add CDP smart-wallet approve + Vault deposit helper
- **What to do**: Replace paid-path operator transfer helper with a smart-wallet operation that approves exactly `amount` USDC to Vault and calls `deposit(creator, amount, receiptRef)` in the same user operation when CDP supports batching. Keep generic outbound transfer helper only for creator wallet claim/withdraw flows.
- **Must NOT do**: Do not approve unlimited USDC. Do not split approve and deposit across independently retryable requests. Do not send paid-access funds to `operatorAccount.address`.
- **Recommended Agent Profile**: `deep` + wallet/security; this touches wallet permissions and payment finality.
- **Parallelization**: Wave 2; can run after W1-T2 ABI; blocks W2-T7.
- **References**: `api/src/services/wallet.ts`, `api/src/config/env.ts`, `api/src/config/cdp.ts`, `api/src/__tests__/e2e-payment.ts`, `api/src/middleware/x402Gate.ts`.
- **Acceptance Criteria**: Mocked CDP call contains exact USDC approve to Vault and Vault `deposit`; tests fail if operator address is used as paid sink; failure returns recoverable state without receipt.
- **QA Scenarios**: Run `npm --prefix api test -- e2e-payment.ts | tee .sisyphus/evidence/w2-t6-wallet-tests.log`; save mocked user-operation payload to `.sisyphus/evidence/w2-t6-userop.json`.
- **Commit message**: `route smart wallet payments to vault`

#### W2-T7 — Refactor x402Gate around Vault deposit before receipt
- **What to do**: Rewrite paid detail gating so the 402 response advertises Vault payment requirements, reserves quote before payment, derives `receiptRef`, submits/observes Vault deposit, verifies log fields, and only then issues `X-Access-Receipt` and delivery entitlement.
- **Must NOT do**: Do not grant plaintext access from a pending or missing Vault deposit. Do not call current operator payment path. Do not call this full external x402 compatibility if the flow still requires CDP approve + deposit.
- **Recommended Agent Profile**: `ultrabrain` + payment state machines; this is the critical receiver swap.
- **Parallelization**: Wave 2; non-parallel critical path; blocked by W2-T5 and W2-T6; blocks W3 buy flow.
- **References**: `api/src/middleware/x402Gate.ts`, `api/src/services/receipt.ts`, `api/src/services/ledger.ts`, `api/src/services/quote.ts`, `api/src/routes/attestations.ts`, `api/src/__tests__/x402Gate.test.ts`.
- **Acceptance Criteria**: Paid request returns receipt with `creatorAddress`, `receiptRef`, `vaultDepositTxHash`, gross/fee/net fields; no code path in `x402Gate.ts` sends funds to `operatorAccount.address`; idempotent repurchase reuses receipt.
- **QA Scenarios**: Run `npm --prefix api test -- x402Gate.test.ts | tee .sisyphus/evidence/w2-t7-x402gate.log`; run a curl paid-detail flow and save headers to `.sisyphus/evidence/w2-t7-paid-detail.txt`.
- **Commit message**: `issue receipts only after vault deposit`

#### W2-T8 — Build receipt ledger, refund, and Vault reconciliation service
- **What to do**: Extend access receipts and ledger with Vault deposit fields; add reconciliation from Vault events; add pending-delivery recovery and refund-required handling; ensure DB receipt/ledger writes remain transactional and replay-safe.
- **Must NOT do**: Do not create claimable balances from DB-only rows. Do not treat mutable `pricing_policies` as settlement truth. Do not refund by default when a DB write can be retried safely.
- **Recommended Agent Profile**: `deep` + backend reconciliation; this task handles stuck funds and split-brain recovery.
- **Parallelization**: Wave 2; can run after W2-T7 interface stabilizes; blocks Wave 6 production readiness.
- **References**: `api/src/services/receipt.ts`, `api/src/services/ledger.ts`, `api/src/db/migrate.ts`, `api/src/routes/health.ts`, `api/src/services/attestation.ts`, `api/src/services/crypto.ts`.
- **Acceptance Criteria**: Simulated deposit + DB failure recovers into receipt on retry; simulated undeliverable artifact becomes refund-required and never claimable; duplicate Vault events are idempotent.
- **QA Scenarios**: Run API tests and save to `.sisyphus/evidence/w2-t8-reconciliation-tests.log`; save a reconciliation dry-run report to `.sisyphus/evidence/w2-t8-reconciliation.md`.
- **Commit message**: `add vault receipt reconciliation and refunds`

### Wave 3 — Claude Code Hook Harness + Artifact Boundary

#### W3-T9 — Enforce artifact kinds and listing activation gates
- **What to do**: Add upload/listing validation for structured JSON plus non-executable `SKILL.md`/prompt documents. Require listing kind (`skill`, `prompt`, `recipe`, `raw_dataset`) and screening-clean state before a listing can become paid-active. Validate `SKILL.md` frontmatter and forbid `allowed_tools`, scripts, URL fetches, dependencies, HTML script/iframe, inline JS, and data-URI images.
- **Must NOT do**: Do not allow arbitrary binaries, archives, executable skill bundles, hidden install steps, or model-callable prompt execution in V1.
- **Recommended Agent Profile**: `deep` + backend/security; this closes the content-risk gap before irreversible Vault payment.
- **Parallelization**: Wave 3; can run after W2 schema shape is known; blocks publish and ranking tasks.
- **References**: `api/src/routes/attest.ts`, `api/src/services/sanitize.ts`, `api/src/services/metadata.ts`, `api/src/services/attestation.ts`, `api/src/db/migrate.ts`.
- **Acceptance Criteria**: Tier 3 artifacts are rejected with clear errors; valid JSON and text-only `SKILL.md` can publish; paid listing cannot activate until validation/screening state is clean.
- **QA Scenarios**: Run upload validation tests and save to `.sisyphus/evidence/w3-t9-artifact-validation.log`; save rejected fixture matrix to `.sisyphus/evidence/w3-t9-fixtures.md`.
- **Commit message**: `enforce v1 artifact boundary`

#### W3-T10 — Build Claude Code harness installer, uninstaller, and discovery skill
- **What to do**: Create npm-distributed harness install flow for Claude Code command hooks. Installer merges hook entries into Claude settings with backup/sentinel, creates text-only ProofWeave discovery skill, creates `~/.proofweave` local state, and supports uninstall restoring settings without zombie hooks.
- **Must NOT do**: Do not implement Codex, MCP, HTTP hooks, prompt-based hooks, or standalone CLI framing in V1. Do not store secrets inside project directories.
- **Recommended Agent Profile**: `artistry` + quick CLI/product; this must preserve the accepted harness UX and avoid plugin-platform creep.
- **Parallelization**: Wave 3; can run alongside W3-T9; blocks hook handler QA.
- **References**: `.claude/settings.local.json`, `api/package.json`, `README.md`, `web/package.json`.
- **Acceptance Criteria**: Install then uninstall in a temp home leaves settings byte-identical; discovery skill passes the same non-executable `SKILL.md` validator; config file is created with `0600` permissions.
- **QA Scenarios**: Run temp-home install/uninstall script and save transcript to `.sisyphus/evidence/w3-t10-install-roundtrip.log`; save before/after settings diff to `.sisyphus/evidence/w3-t10-settings.diff`.
- **Commit message**: `add claude code harness installer`

#### W3-T11 — Implement harness CLI transport commands
- **What to do**: Add CLI transport commands used by the harness: auth, publish, search, preview, buy, install-artifact, stats, and receipts. Wire them to current API routes and the Vault-backed gated download path. Persist receipts locally and make repurchase idempotent.
- **Must NOT do**: Do not bypass server payment checks. Do not calculate authoritative stats locally. Do not expose Codex/MCP commands except as explicit V1.1 stubs if needed.
- **Recommended Agent Profile**: `quick` + TypeScript CLI/API integration; commands are separable but must share auth/receipt plumbing.
- **Parallelization**: Wave 3; command subwork parallelizable; `buy` blocked by W2-T7.
- **References**: `api/src/routes/auth.ts`, `api/src/routes/attest.ts`, `api/src/routes/attestations.ts`, `api/src/routes/purchases.ts`, `api/src/routes/stats.ts`, `api/src/middleware/x402Gate.ts`.
- **Acceptance Criteria**: Each command has mocked API tests; `buy` captures `X-Access-Receipt`; `stats` reads canonical server stats; receipts list/show returns persisted receipt metadata.
- **QA Scenarios**: Run CLI command fixture tests and save to `.sisyphus/evidence/w3-t11-cli-tests.log`; run local API smoke commands and save to `.sisyphus/evidence/w3-t11-cli-smoke.txt`.
- **Commit message**: `add proofweave harness cli commands`

#### W3-T12 — Add fail-open hook handlers, local policy, and credential safety
- **What to do**: Implement command-type hook handlers for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, and SessionEnd. Hooks must fail open, log locally, never block Claude on harness errors, enforce fixed API origin, require purchase confirmation/price caps, and refuse broad config permissions.
- **Must NOT do**: Do not let model text trigger paid purchase without human/policy approval. Do not store private keys. Do not silently auto-update harness code.
- **Recommended Agent Profile**: `deep` + CLI/security; local hooks are a terminal-code-execution trust boundary.
- **Parallelization**: Wave 3; blocked by W3-T10; can run alongside W3-T11 except buy telemetry depends on receipts.
- **References**: `.claude/settings.local.json`, `api/src/services/wallet.ts`, `api/src/config/keychain.ts`, `api/src/config/cdp.ts`, `README.md`.
- **Acceptance Criteria**: No-op hook path returns `{continue: true}` under 50ms p95; broad-permission config causes CLI refusal; purchase above zero requires confirmation or explicit local policy; hook errors log and return continue.
- **QA Scenarios**: Run hook fixture suite and save to `.sisyphus/evidence/w3-t12-hook-tests.log`; run credential-permission test and save to `.sisyphus/evidence/w3-t12-permissions.txt`.
- **Commit message**: `add fail open claude hook handlers`

### Wave 4 — Listing Kinds, Ratings, EIP-8004 Stub, and Composite Ranking

#### W4-T13 — Add receipt-gated web ratings
- **What to do**: Add receipt-bound binary web ratings with optional short reason. Ratings must validate receipt ownership, reject creator self-rating, enforce one active rating per receipt/listing, and expose per-listing plus per-creator aggregates separately.
- **Must NOT do**: Do not allow anonymous likes, non-buyer ratings, star ratings, or multidimensional review forms in V1.
- **Recommended Agent Profile**: `unspecified-high` + backend/data integrity; eligibility rules must resist cheap spam.
- **Parallelization**: Wave 4; blocked by W2 receipts; blocks ranking display.
- **References**: `api/src/db/migrate.ts`, `api/src/routes/purchases.ts`, `api/src/routes/attestations.ts`, `api/src/services/receipt.ts`, `web/src/components/AttestationPurchaseModal.tsx`.
- **Acceptance Criteria**: API rejects ratings without valid receipt, rejects creator self-rating, enforces uniqueness, and returns listing/creator aggregates with sample size.
- **QA Scenarios**: Run API rating tests and save to `.sisyphus/evidence/w4-t13-rating-tests.log`; save curl examples for allowed/rejected ratings to `.sisyphus/evidence/w4-t13-rating-curl.txt`.
- **Commit message**: `add receipt gated ratings`

#### W4-T14 — Add listing kind taxonomy and filters
- **What to do**: Add required listing kind at upload and search filters for `skill`, `prompt`, `recipe`, and `raw_dataset`. Use kind-specific validation hooks and make kind visible in cards, detail views, and CLI search output.
- **Must NOT do**: Do not add `misc` or infer kind only from metadata. Do not let raw datasets remain the implicit default hero product.
- **Recommended Agent Profile**: `artistry` + product/data modeling; this preserves the prompt/skill/recipe wedge while keeping data supported.
- **Parallelization**: Wave 4; blocked by W3-T9; can run alongside W4-T13.
- **References**: `api/src/routes/attest.ts`, `api/src/routes/attestations.ts`, `api/src/db/migrate.ts`, `web/src/pages/ExplorerPage.tsx`, `web/src/components/AttestationCard.tsx`, `web/src/pages/AttestPage.tsx`.
- **Acceptance Criteria**: Upload requires kind; search facets include kind; CLI/web search can filter by kind; invalid/missing kind fails validation; existing legacy rows have a safe migration/default strategy.
- **QA Scenarios**: Run upload/search tests and save to `.sisyphus/evidence/w4-t14-kind-tests.log`; run web build after UI changes and save to `.sisyphus/evidence/w4-t14-web-build.log`.
- **Commit message**: `add listing kind taxonomy`

#### W4-T15 — Add EIP-8004 adapter feature flag with neutral fallback
- **What to do**: Add a feature-flagged EIP-8004 reputation adapter/stub that can consume external scores if configured, report availability/status, and return neutral scores when unavailable or malformed. Keep all reputation integration out of `AttestationRegistry` unless a later ADR proves otherwise.
- **Must NOT do**: Do not block purchase, delivery, or ranking when EIP-8004 is unavailable. Do not write marketplace reputation into the provenance contract. Do not treat missing scores as negative.
- **Recommended Agent Profile**: `ultrabrain` + protocol integration; this prevents standard-readiness risk from swallowing V1.
- **Parallelization**: Wave 4; can run alongside ratings and kind work; blocks final composite ranking formula.
- **References**: `src/AttestationRegistry.sol`, `api/src/db/migrate.ts`, `api/src/routes/attestations.ts`, `api/src/services/analytics.ts`, `api/src/config/env.ts`.
- **Acceptance Criteria**: With feature flag off, ranking uses `β=0` and reports external reputation unavailable; malformed external data is neutral; no contract changes are made for reputation.
- **QA Scenarios**: Run adapter unit tests and save to `.sisyphus/evidence/w4-t15-eip8004-adapter.log`; save ranking response samples with flag on/off to `.sisyphus/evidence/w4-t15-ranking-samples.json`.
- **Commit message**: `add neutral eip8004 reputation adapter`

#### W4-T16 — Implement composite ranking service and visible explanations
- **What to do**: Implement deterministic composite ranking using receipt-gated web rating, optional EIP-8004 score, log-scaled verified purchase count, recency decay, and measured savings quality. Return debug/explanation fields in API and surface why listings ranked high in web/CLI.
- **Must NOT do**: Do not use opaque AI rankers. Do not let synthetic benchmark savings influence ranking. Do not display strong quality badges before minimum rater diversity.
- **Recommended Agent Profile**: `visual-engineering` + backend/data UI; this needs explainable ranking and visible trust states.
- **Parallelization**: Wave 4; blocked by W4-T13, W4-T14, W4-T15 and initial savings fields; blocks final marketplace QA.
- **References**: `api/src/routes/attestations.ts`, `api/src/services/analytics.ts`, `api/src/routes/stats.ts`, `web/src/pages/ExplorerPage.tsx`, `web/src/components/AttestationCard.tsx`, `web/src/pages/AnalyticsPage.tsx`.
- **Acceptance Criteria**: `/search?sort=composite` returns score components, sample sizes, feature-flag status, and explanation; web UI shows rating count, kind, external reputation availability, and savings confidence without magic-score-only display.
- **QA Scenarios**: Run API search tests and save to `.sisyphus/evidence/w4-t16-ranking-tests.log`; run Playwright or component QA for Explorer ranking states and save screenshots to `.sisyphus/evidence/w4-t16-ranking-ui/`.
- **Commit message**: `add explainable composite ranking`

### Wave 5 — Token-Efficiency Instrumentation and Honest Reporting

#### W5-T17 — Harden analytics schema for hook-measured savings
- **What to do**: Extend existing analytics tables rather than creating a parallel schema. Add model/provider, prompt/template hash, listing kind, estimated and actual token usage, actual LLM cost, ProofWeave purchase cost, retries, latency, completion status, quality status, receipt ID, and savings fields.
- **Must NOT do**: Do not publish savings rows without receipt and hook event anchors. Do not default actual cost to zero for counted savings. Do not fork calculations between API, web, and CLI.
- **Recommended Agent Profile**: `deep` + backend analytics; this is the measurement source of truth.
- **Parallelization**: Wave 5; can begin after W3 hook event shape and W2 receipts stabilize; blocks W5-T20.
- **References**: `api/src/db/migrate.ts`, `api/src/services/analytics.ts`, `api/src/routes/ai.ts`, `api/src/routes/attestations.ts`, `api/src/routes/stats.ts`.
- **Acceptance Criteria**: Each counted savings event links to purchase receipt, hook event, prompt/template hash, model, listing kind, and quality status; failed purchases and fallbacks are represented in denominator metrics.
- **QA Scenarios**: Run migration and analytics tests, save to `.sisyphus/evidence/w5-t17-analytics-schema.log`; save sample event rows to `.sisyphus/evidence/w5-t17-sample-events.json`.
- **Commit message**: `extend analytics for hook measured savings`

#### W5-T18 — Capture hook-side before/after usage and adapter events
- **What to do**: From Claude Code hook handlers, record candidate LLM task intent, prompt/template hash, model, estimated tokens, artifact search/buy/install actions, receipt ID, retries, fallback-to-LLM, abandonment, and completion status. Emit canonical adapter events for artifact submitted, usage measured, quote accepted, receipt stored, and delivery recorded.
- **Must NOT do**: Do not count savings from happy paths only. Do not make hook failures block Claude. Do not expose secrets in local telemetry logs.
- **Recommended Agent Profile**: `quick` + harness/backend telemetry; this connects the harness to the analytics rig.
- **Parallelization**: Wave 5; blocked by W3-T12 and W5-T17 schema; can run alongside W5-T19.
- **References**: `.claude/settings.local.json`, `api/src/services/analytics.ts`, `api/src/routes/stats.ts`, `api/src/routes/attestations.ts`, `api/src/services/receipt.ts`.
- **Acceptance Criteria**: Scripted harness flow emits all five canonical event kinds; local telemetry flush deduplicates by session/idempotency key; failed artifact purchase and fallback are recorded.
- **QA Scenarios**: Run hook telemetry fixture and save to `.sisyphus/evidence/w5-t18-hook-telemetry.log`; save adapter event transcript to `.sisyphus/evidence/w5-t18-adapter-events.jsonl`.
- **Commit message**: `capture hook side savings events`

#### W5-T19 — Build paired benchmark harness and quality rubric
- **What to do**: Define fixed workloads with target outputs and run each in direct-LLM mode and ProofWeave-purchase mode under controlled model/template settings. Add quality rubric gates per listing kind so savings only count when output passes.
- **Must NOT do**: Do not use cherry-picked bloated prompts as baselines. Do not mix synthetic benchmark results into live marketplace ranking unless explicitly labeled and gated.
- **Recommended Agent Profile**: `unspecified-high` + evaluation design; this prevents measurement theater.
- **Parallelization**: Wave 5; can run after listing kinds and initial harness commands; blocks marketing claims and ranking `measured_savings_quality` confidence.
- **References**: `api/src/services/analytics.ts`, `api/src/routes/ai.ts`, `api/src/routes/stats.ts`, `api/src/db/migrate.ts`, `README.md`.
- **Acceptance Criteria**: Benchmark report shows direct vs ProofWeave modes, model/template, quality pass/fail, retries, latency, purchase cost, token cost, median, confidence interval, sample size, and failure rate.
- **QA Scenarios**: Run benchmark harness against fixtures and save to `.sisyphus/evidence/w5-t19-benchmark-report.json`; save human-readable summary to `.sisyphus/evidence/w5-t19-benchmark-summary.md`.
- **Commit message**: `add paired token savings benchmark harness`

#### W5-T20 — Add canonical savings report endpoint and stats consumers
- **What to do**: Add a canonical backend report endpoint consumed by web analytics and harness `stats`. Report per model, prompt/template, listing kind, time window, median, confidence interval, sample size, failure rate, purchase costs, and quality pass rate. Make CLI/web numbers read this endpoint exactly.
- **Must NOT do**: Do not recompute savings separately in frontend or local CLI. Do not display 90% savings language unless backed by report filters and sample size.
- **Recommended Agent Profile**: `visual-engineering` + analytics presentation; this aligns API, web, and harness output.
- **Parallelization**: Wave 5; blocked by W5-T17 and W5-T18; can finish after W5-T19 labels synthetic reports.
- **References**: `api/src/routes/stats.ts`, `api/src/services/analytics.ts`, `web/src/pages/AnalyticsPage.tsx`, `web/src/pages/DashboardPage.tsx`, `api/src/routes/purchases.ts`.
- **Acceptance Criteria**: CLI stats and web analytics show identical values from the canonical endpoint; synthetic-only reports are labeled separately; failed/fallback events are included in denominators.
- **QA Scenarios**: Run API stats tests and save to `.sisyphus/evidence/w5-t20-stats-tests.log`; run web build and save to `.sisyphus/evidence/w5-t20-web-build.log`; save API/CLI diff proof to `.sisyphus/evidence/w5-t20-cli-web-parity.txt`.
- **Commit message**: `add canonical token savings reports`

### Wave 6 — Release Hardening, E2E QA, and Documentation

#### W6-T21 — Add hook harness doctor, package provenance, and manual update policy
- **What to do**: Add `proofweave doctor` checks for hook installation, config permissions, API reachability, CDP wallet binding, staging test buy, local telemetry health, and version compatibility. Document package provenance/signing, lock dependencies, and enforce manual update only for V1.
- **Must NOT do**: Do not add silent auto-update. Do not publish mutable-branch install instructions. Do not pass doctor if config permissions are broad.
- **Recommended Agent Profile**: `deep` + supply-chain/CLI security; this addresses npm/hook execution risk.
- **Parallelization**: Wave 6; blocked by Wave 3 harness and Wave 2 buy flow; can run alongside W6-T22.
- **References**: `api/package.json`, `web/package.json`, `README.md`, `.env.example`, `.claude/settings.local.json`.
- **Acceptance Criteria**: Doctor prints pass/fail rows and exits non-zero on failures; release docs mention locked dependencies, no silent auto-update, and version-pinned install; package lock/provenance process is documented.
- **QA Scenarios**: Run doctor success/failure fixtures and save to `.sisyphus/evidence/w6-t21-doctor.log`; save release checklist to `.sisyphus/evidence/w6-t21-release-checklist.md`.
- **Commit message**: `add harness doctor and release safety`

#### W6-T22 — Complete targeted security hardening pass
- **What to do**: Review and fix the high-risk boundaries: Vault reentrancy/refund/upgrade, API payment/delivery split-brain, server decrypt claims, upload quarantine, hook local credentials, prompt-injected purchases, rating abuse, and EIP-8004 neutral fallback. Produce threat model and residual-risk note.
- **Must NOT do**: Do not claim end-to-end privacy. Do not defer upload screening past paid listing. Do not let EIP-8004 failure block purchase/delivery.
- **Recommended Agent Profile**: `deep` + security review; this is a cross-boundary audit pass.
- **Parallelization**: Wave 6; blocked by Waves 1-5; can run with W6-T21 and W6-T23 after code stabilizes.
- **References**: `src/AttestationRegistry.sol`, `api/src/middleware/x402Gate.ts`, `api/src/services/crypto.ts`, `api/src/routes/attest.ts`, `api/src/services/sanitize.ts`, `api/src/routes/health.ts`, `web/src/pages/AdminDashboard.tsx`.
- **Acceptance Criteria**: Threat model covers onchain, backend, hook harness, frontend/ranking; all critical/high findings fixed or explicitly blocked by open user decision; no dev/fake payment path works outside local.
- **QA Scenarios**: Save threat model to `.sisyphus/evidence/w6-t22-threat-model.md`; run security regression commands and save to `.sisyphus/evidence/w6-t22-security-regression.log`.
- **Commit message**: `harden vault harness and ranking security`

#### W6-T23 — Run Base Sepolia end-to-end smoke flow
- **What to do**: Exercise the full V1 flow on Base Sepolia/staging: publish valid artifact, quote, Vault deposit, receipt issue, delivery, install through Claude Code harness, hook telemetry flush, rating submit, composite ranking update, stats report, and creator claim/withdraw.
- **Must NOT do**: Do not use synthetic receipts, operator-paid legacy payments, or local-only fake tx for the final smoke evidence.
- **Recommended Agent Profile**: `unspecified-high` + QA/e2e; this validates the critical path from user action to Vault claim.
- **Parallelization**: Wave 6; blocked by all feature waves; can run before final verification but after security fixes.
- **References**: `api/src/__tests__/e2e-payment.ts`, `api/src/middleware/x402Gate.ts`, `api/src/routes/attest.ts`, `api/src/routes/attestations.ts`, `api/src/routes/wallet.ts`, `web/src/pages/ExplorerPage.tsx`.
- **Acceptance Criteria**: Evidence includes tx hash, Vault event, receipt header, delivered artifact checksum, hook telemetry event, rating row, ranking response, stats output, and claim/withdraw transaction or testnet equivalent.
- **QA Scenarios**: Run scripted smoke flow and save transcript to `.sisyphus/evidence/w6-t23-sepolia-smoke.log`; save headers/tx hashes to `.sisyphus/evidence/w6-t23-artifacts.json`.
- **Commit message**: `verify sepolia vault harness flow`

#### W6-T24 — Update docs, guardrail copy, and evidence index
- **What to do**: Update README/API/payment docs with Vault-direct V1, Claude Code harness install, artifact boundaries, security/trust disclaimers, ranking explanation, token-savings methodology, and an evidence index linking task QA outputs.
- **Must NOT do**: Do not use marketing-grade 90% savings language. Do not imply arbitrary executable artifacts, generic LLM integration, or mainnet readiness before audit. Do not hide that server can decrypt delivered artifacts.
- **Recommended Agent Profile**: `artistry` + quick docs/scope fidelity; this ensures the final plan and product copy do not contradict implementation constraints.
- **Parallelization**: Wave 6; can run alongside W6-T22 after interfaces are stable; blocks final release.
- **References**: `README.md`, `TECH_STACK.md`, `api/src/routes/stats.ts`, `web/src/pages/LandingPage.tsx`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/AnalyticsPage.tsx`.
- **Acceptance Criteria**: Docs state Vault as receiver, audit gate, Claude Code-only V1, allowed artifact kinds, EIP-8004 fallback, and benchmark requirements; `.sisyphus/evidence/index.md` links every task QA artifact.
- **QA Scenarios**: Run docs link check or grep-based guardrail check and save to `.sisyphus/evidence/w6-t24-docs-check.log`; save final evidence index to `.sisyphus/evidence/index.md`.
- **Commit message**: `document vault direct harness v1 constraints`

---

## Final Verification Wave (4 parallel agents)

### F1 — Plan compliance audit
- **Agent**: `ultrabrain`.
- **Scope**: Verify every Must Have and Must NOT Have is satisfied or explicitly blocked by an open decision.
- **Evidence**: `.sisyphus/evidence/f1-plan-compliance.md`.

### F2 — Code quality and test audit
- **Agent**: `unspecified-high`.
- **Scope**: Run `forge test`, `npm --prefix api test`, `npm --prefix api run build`, `npm --prefix web run build`; inspect failed/skipped tests and type gaps.
- **Evidence**: `.sisyphus/evidence/f2-code-quality.log`.

### F3 — Manual QA / browser + terminal flow
- **Agent**: `visual-engineering`.
- **Scope**: Verify web listing/rating/ranking states and terminal harness install/buy/stats UX from a fresh user persona.
- **Evidence**: `.sisyphus/evidence/f3-manual-qa.md` plus screenshots/transcripts.

### F4 — Scope fidelity and security posture
- **Agent**: `deep`.
- **Scope**: Confirm no operator-custodial V1 fallback, no arbitrary executable artifacts, no non-Claude integrations, no EIP-8004 hard dependency, no fake savings claim, and no undocumented custody/privacy claim.
- **Evidence**: `.sisyphus/evidence/f4-scope-security.md`.

---

## Commit Strategy
Use wave-scoped commits. Each task includes a suggested commit message. Do not mix contract custody changes with harness UI changes. Do not mix ranking/reputation changes with token benchmark changes unless the task explicitly spans both. Do not commit generated evidence except concise `.sisyphus/evidence/` summaries, test logs, screenshots, and command transcripts needed for QA. Suggested order: W1 contract commits, W2 payment commits, W3 harness commits, W4 ranking commits, W5 analytics commits, W6 hardening/docs commits, then final verification fixes.

---

## Success Criteria
- `forge test` passes with Vault and upgrade tests.
- `npm --prefix api test` and `npm --prefix api run build` pass.
- `npm --prefix web run build` passes after ranking/UI work.
- Harness install/uninstall round-trip is tested in a temp home and leaves no zombie hooks.
- Base Sepolia smoke flow proves publish → quote → Vault deposit → receipt → delivery → rating → stats → claim.
- Token-savings report rejects synthetic-only data and shows denominators, failure rate, and confidence interval.
- Evidence for all task QA scenarios exists under `.sisyphus/evidence/`.
- Search/ranking response exposes score components and neutral EIP-8004 fallback state.
- README/product copy contains no unsupported privacy, mainnet, generic integration, or 90% savings claims.

---

## Open Decisions Still Needed From User
1. Should Vault live inside the existing `AttestationRegistry` UUPS proxy, or as a separate `PaymentVault.sol` UUPS proxy referenced by the API?
2. What protocol fee bps and fee recipient should be used for MVP?
3. Who controls pause, refund, and upgrade authority on Sepolia and later mainnet?
4. Is V1 Base Sepolia only, or is any Base mainnet exposure expected before independent audit?
5. Should Claude Code harness install default to user-level `~/.claude/` or project-level `./.claude/`?
6. If EIP-8004 is unavailable or unstable, does V1 ship rating-only ranking with `β=0`?
