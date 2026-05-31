# Area #6 — Security Revision

## Threat Model (revised for vault + hook harness)

The pivot changes the security center of gravity. ProofWeave is no longer just an API-mediated payment gate; it now has direct onchain settlement through a Vault contract and a first product surface that runs inside the user's terminal through a Claude Code hook harness. That creates four hard trust boundaries.

### Trust Boundaries (4 layers)

#### 1. Onchain (Vault contract, AttestationRegistry, claim flow)

- **Attack surface:** Vault deposit, price/payment verification, creator accounting, claim/withdraw, USDC transfer calls, upgrade authorization, AttestationRegistry linkage, event indexing, and any operator deposit-on-behalf flow.
- **New threats introduced by this pivot:** payment finality becomes irreversible enough that upload abuse and pricing mistakes become financial disputes; claim bugs can drain creator balances; a Vault upgrade can rewrite settlement rules; direct USDC interaction introduces non-standard ERC-20 behavior assumptions; operator-key compromise can create fake deposits, route payments incorrectly, or spam settlement actions if the key has privileged functions.
- **Mitigations:** make the Vault narrow: buyer pays Vault, Vault credits creator, creator pulls. Use `ReentrancyGuard`, checks-effects-interactions, `SafeERC20`, per-attestation immutable price snapshots, no unbounded loops, no batch creator iteration in V1, explicit pause controls, event-rich accounting, Foundry invariant tests, and a deployer/admin model with multisig plus timelock before mainnet. On Sepolia, deploy fast but label it testnet. On Base mainnet, require independent audit before handling real funds.

#### 2. Backend API (encryption, receipt issuance, delivery)

- **Attack surface:** upload validation, metadata extraction, server-side encryption, key storage, receipt issuance, delivery authorization, reconciliation against Vault events, search ranking, admin moderation, and API keys.
- **New threats introduced by this pivot:** backend can grant access before observing confirmed Vault payment; upload screening can happen after irreversible payment; server can decrypt all artifacts while marketing may imply stronger privacy; ranking now mixes payment, ratings, and onchain reputation and can amplify abuse.
- **Mitigations:** treat Vault event confirmation as the source of payment truth, with API receipts as cached entitlements only. Require upload screening before enabling paid listing. Keep public manifest separate from private encrypted artifact. Store key versions and use KMS/Vault rather than a raw app env key in production. Never claim E2E privacy. Add reconciliation jobs from Vault events to DB receipts, quarantine states, takedown flows, and audit logs for every decrypt/delivery.

#### 3. Claude Code hook harness (runs in user's terminal — code injection risk)

- **Attack surface:** npm package install, hook configuration, local API key storage, request signing/payment authorization, terminal environment, project files, wallet/session delegation, hook event payloads, and model-generated or project-provided instructions.
- **New threats introduced by this pivot:** malicious repos can prompt-inject Claude into buying data; project-local `CLAUDE.md` or hooks can try to exfiltrate ProofWeave credentials; the harness can read env/files by default if poorly scoped; auto-updates can ship malicious or broken code; npm dependency compromise becomes wallet/payment compromise.
- **Mitigations:** harness must be deny-by-default. It should never hold a full wallet private key. Use session-scoped API token or CDP spend permission with amount/time/domain limits. Require explicit human approval for any purchase above zero in V1, or at minimum for first purchase per project/listing. Store credentials in OS keychain when possible; fallback file must be `0600`, outside repo, never committed. Disable auto-update by default; require manual update with changelog and signed package provenance. Treat hook input as hostile and never execute artifact content.

#### 4. Frontend (admin/ops dashboard, public listing browser)

- **Attack surface:** listing browser, previews, ratings UI, admin moderation actions, claim dashboard, payment status display, and operational controls such as pause/quarantine.
- **New threats introduced by this pivot:** public previews can leak sensitive content; admins can accidentally approve unsafe artifacts; rating/ranking UI can launder collusion into credibility; claim status can mislead creators if reconciliation lags.
- **Mitigations:** sanitize all rendered metadata, isolate previews, never render executable HTML from artifacts, expose payment states honestly (`pending`, `confirmed`, `reconciled`, `claimable`, `withdrawn`), require admin confirmation for quarantine/unquarantine, and make suspicious rating loops visible in ops tooling.

## Vault-Specific Risks (critical)

- **Reentrancy on claim:** creator claims must update internal state before external USDC transfer and use `nonReentrant`. Even with USDC, assume hostile token behavior or future token expansion.
- **Unbounded creator iteration on batch operations:** do not implement batch payout over creator arrays in V1. Use per-creator pull claims. If later batch exists, it must be bounded, paginated, and failure-isolated.
- **USDC token interaction:** use `SafeERC20`. Avoid approval-based flows where possible; buyer should transfer/pay into Vault directly. If an allowance path is required, use exact allowance and reset patterns; do not leave broad approvals. Handle `transfer` returning false or no return.
- **Operator-key compromise:** if the deposit-on-behalf key can credit arbitrary creators or mark payments, blast radius is severe: fake purchases, griefing, accounting corruption, or treasury drain if privileged withdrawals exist. The operator must not be able to withdraw user funds. Restrict it to pausable, bounded helper actions; all value movement should be buyer-to-Vault and creator-pull.
- **Upgrade safety (UUPS):** UUPS is dangerous without governance. Sepolia can use deployer-owned upgrades for iteration, but mainnet needs multisig owner, timelock, upgrade delay, and an emergency pause. Storage layout tests are mandatory.
- **Audit requirement:** Base Sepolia can launch unaudited with test funds and warnings. Base mainnet cannot responsibly launch a Vault holding buyer/creator funds without audit, invariant tests, and a documented incident response plan.

## Hook Harness Security

The hook harness is the riskiest product surface because it executes in the user's terminal. It may see environment variables, local files, git remotes, API keys, and wallet-adjacent credentials.

- **Supply chain:** publish from locked dependencies, commit lockfile, pin transitive versions where possible, generate provenance, sign releases, and document package integrity. Do not ask users to install from a mutable branch.
- **Auto-update:** no silent auto-update. Manual approval only for V1. Auto-update can become a remote-code-execution distribution channel.
- **API key storage:** prefer OS keychain. Fallback: `~/.proofweave/config.json` or equivalent with `0600` permissions, never inside project directories. The CLI must refuse to run if config permissions are broad.
- **Wallet authorization scope:** the harness should hold only a session-scoped delegation or API token. It should never store a full private key. If CDP Spend Permissions are used, limit by token, amount, period, spender, and expiry.
- **Hook event abuse:** malicious project context can ask Claude to buy attacker listings. Anti-prompt-injection design must be outside the model: fixed allowlist of ProofWeave API origins, price caps, per-project confirmation, listing preview shown to human, no purchase triggered solely by model text, and a local policy file that defaults to deny.

## Reputation System Security (new — EIP-8004 + web ratings)

Reputation can influence ranking, but it must not become an unverified money printer.

- **Sybil resistance:** no web rating without verified purchase or verified delivery entitlement. Weight ratings by purchase uniqueness and account age, not raw count.
- **Rate-limit abuse on EIP-8004 attestations:** onchain feedback can be spammed or bought. Index it, but cap its ranking influence and require source filters. Treat unavailable or malformed EIP-8004 data as neutral, not negative.
- **Collusion:** creator-buyer loops are expected. Detect self-dealing through shared wallet clusters, repeated reciprocal purchases, identical funding sources, abnormal rating velocity, and same-IP/browser patterns on web ratings.
- **Graceful degradation:** if EIP-8004 is unavailable, ranking falls back to verified purchase count, web ratings, artifact metadata quality, freshness, and manual trust flags. Never block purchase or delivery solely because EIP-8004 cannot be read.

## Existing Issues (carried over)

- **Server can decrypt all artifacts:** there is no E2E privacy claim in V1. Say plainly: ProofWeave encrypts at rest and controls access, but the backend can decrypt for delivery.
- **Plaintext delivery:** resale is possible after first purchase. This is acceptable for V1 only if terms, watermarking/receipt binding, and abuse reporting are explicit. Do not promise non-resale prevention.
- **Upload screening before irreversible payment:** listing must not accept Vault payments until artifact is scanned, metadata generated, and listing state is `active`. Otherwise users can pay for content later quarantined.

## MVP Artifact Boundary

User did not explicitly confirm. Conservative default requiring confirmation:

- **Tier 1 (allowed in V1):** structured JSON plus non-executable `SKILL.md`/prompt documents. `SKILL.md` must be treated as text only; no `allowed_tools`, no executable scripts, no hidden install steps.
- **Tier 2 (carry over but freeze):** existing V2-encrypted raw artifacts via legacy upload path. Mark deprecated, do not expand capabilities, and require admin quarantine tooling.
- **Tier 3 (forbidden):** arbitrary binaries, executable code, scripts with `allowed_tools`, archive files, files containing URLs that auto-fetch, and any payload that asks the hook/LLM to execute commands or install dependencies.

## Implementation Tasks (5-8 tasks)

1. **Vault claim hardening**
   - **Files:** `src/*Vault*.sol`, `test/*Vault*.t.sol`
   - **Agent profile:** Solidity/security
   - **Parallelizable:** Yes, with backend reconciliation task
   - **Blockers:** Vault interface decision
   - **Attack mitigated:** reentrancy, failed USDC transfer, creator balance drain
   - **Acceptance criteria:** `nonReentrant` claims, checks-effects-interactions, `SafeERC20`, no unbounded loops, Foundry reentrancy and failure tests pass.

2. **Vault upgrade/governance controls**
   - **Files:** deploy scripts, proxy admin config, ownership docs
   - **Agent profile:** Solidity/deployment
   - **Parallelizable:** Yes
   - **Blockers:** mainnet governance choice
   - **Attack mitigated:** malicious/accidental UUPS upgrade
   - **Acceptance criteria:** Sepolia owner documented; mainnet plan requires multisig + timelock + pause; storage layout test added.

3. **Payment reconciliation pipeline**
   - **Files:** `api/src/services/*`, `api/src/db/migrate.ts`, worker/cron entrypoint
   - **Agent profile:** Backend
   - **Parallelizable:** Yes
   - **Blockers:** Vault events finalized
   - **Attack mitigated:** granting access without confirmed payment, missed claims
   - **Acceptance criteria:** Vault events create immutable receipt rows; duplicate events are idempotent; stale pending payments are detectable.

4. **Upload gate and artifact tier enforcement**
   - **Files:** `api/src/routes/attest.ts`, upload validation services
   - **Agent profile:** Backend/security
   - **Parallelizable:** Yes
   - **Blockers:** artifact boundary confirmation
   - **Attack mitigated:** malware, executable payloads, PII/secrets ingestion
   - **Acceptance criteria:** Tier 3 rejected; Tier 1 schema enforced; listing cannot become paid-active until screening state is clean.

5. **Hook harness local credential and purchase policy**
   - **Files:** npm harness package, hook config templates
   - **Agent profile:** CLI/security
   - **Parallelizable:** Yes
   - **Blockers:** harness package layout
   - **Attack mitigated:** local credential theft, prompt-injected purchases
   - **Acceptance criteria:** no private key storage; config file permission check; explicit purchase confirmation; fixed API origin; price cap policy.

6. **Manual update and package provenance**
   - **Files:** package scripts, release workflow, README install docs
   - **Agent profile:** DevOps/supply-chain
   - **Parallelizable:** Yes
   - **Blockers:** package registry decision
   - **Attack mitigated:** malicious auto-update, dependency compromise
   - **Acceptance criteria:** lockfile committed; no silent auto-update; release provenance/signing documented; install command pins version.

7. **Reputation abuse controls for ranking**
   - **Files:** rating routes, ranking service, analytics tables
   - **Agent profile:** Backend/data
   - **Parallelizable:** Yes
   - **Blockers:** ranking schema
   - **Attack mitigated:** sybil ratings, collusive creator-buyer loops
   - **Acceptance criteria:** rating requires verified purchase; EIP-8004 failure is neutral; suspicious rating velocity is flagged.

## Open Questions for User

- Is V1 launch intended for Base Sepolia only, or any Base mainnet exposure?
- What audit budget and timeline exist before mainnet Vault deployment?
- Is plaintext resale risk acceptable for V1 after purchase, with terms and audit logs but no technical prevention?
- Should the terminal hook harness require manual update only, or is any controlled auto-update acceptable later?
- Confirm MVP artifact boundary: Tier 1 only for new uploads, freeze Tier 2, forbid Tier 3?
