# ProofWeave Hyperplan — Adversarial Synthesis

## 1. Convergent Findings (3+ critics agreed)

The critics converged on one uncomfortable point: ProofWeave does not yet have a closed economic loop. Low-skeptic, high-skeptic, ultra-logic, and deep all identified the same gap in different terms: the repo has upload/provenance, optional pricing, operator-directed payment, access receipts, and partial analytics, but it does not yet prove creator publish -> buyer quote/pay -> receipt-gated delivery -> creator attribution/payout -> feedback. Any plan that treats the seven areas as separate feature lanes will produce disconnected prototypes.

There was also strong agreement that the settlement model must be named honestly. Ultra-logic found that payment docs moved payment out of the attestation contract into x402/AccessReceipt, while `x402Gate.ts` currently sends buyer funds to the operator. High-skeptic and deep agreed this makes immediate trustless creator settlement impossible without an architecture fork. The compatible MVP model is operator-custodial attribution first, not an onchain claim contract pretending funds are already escrowed.

Three critics agreed that the CLI is the only credible first surface, but low-skeptic warned against mistaking CLI polish for economic proof. Artistry argued the product wedge is a CLI-first registry for executable artifacts. High-skeptic and deep accepted npm CLI as the first target while rejecting generic "LLM web" integration. The consensus version is narrow: build one CLI path that exercises real quote, payment, receipt, delivery, and stats flows. Do not build a broad integration platform.

All critics accepted the scope correction that Area #2 is excluded from implementation. EIP-8004 and prompt guard are dependency risks only. Nothing in settlement, payment, delivery, or ranking can rely on them until the teammate's server-side reputation path exists and is receipt-bound.

Finally, critics agreed that Area #6 cannot be a generic audit task. Deep emphasized server-side decryption, plaintext delivery, operator-held funds, unsafe uploads, and legal/content exposure. Ultra-logic emphasized payment/receipt split-brain and quote replay. High-skeptic emphasized no dev-mode bypass and no pretending DB balances are trustless. Security must be tied to the actual money and delivery flow.

## 2. Sharp Disagreements + Verdicts

**CLI-first registry vs. economic-loop-first.** Artistry argued the CLI-first artifact registry is the product wedge. Low-skeptic objected that this framing can smuggle in catalog and packaging work before the quote/pay/deliver/reconcile path is proven. Verdict: Artistry is right on positioning; low-skeptic is right on sequencing. Build CLI as the first surface, but only as a thin client over the hardened economic loop.

**Structured JSON beta vs. prompt/skill demand signal.** Deep initially pushed structured JSON or tightly allowlisted files for safety. Artistry objected that JSON-only makes Area #7 unfalsifiable and tests the crowded data-marketplace hypothesis instead of the prompt/skill thesis. Verdict: Artistry's correction is accepted. MVP supports two tightly scoped artifact kinds: structured JSON and non-executable `SKILL.md`/prompt documents. `SKILL.md` is text only: required frontmatter `name`, `description`, `version`, `license`; forbidden URL fetches, script refs, dependencies, `allowed_tools`, bundled hooks, script/iframe/inline JS/data-URI images. No arbitrary files and no callable execution.

**DB balances as MVP vs. financial drift risk.** Deep recommended DB creator balances and manual/admin payout before any claim contract. High-skeptic objected that DB balances can drift across receipts, refunds, manual exports, and revenue views unless treated as append-only accounting. Verdict: DB attribution is acceptable only as S0 operator-held accounting. UI must say "pending admin payout" or "held by operator," not "claimable onchain balance."

**Strict state machines vs. over-engineering.** Ultra-logic demanded quote reservation before transfer and settlement reconciliation from immutable receipts. Deep replied that state-machine elegance can outrun demand validation and content/legal controls. Verdict: keep the invariants where irreversible payment or paid delivery can break. Do not overbuild financial abstractions beyond that. Content controls are equally mandatory.

**Session payment and agent payment as one primitive.** Artistry claimed they are one streaming primitive at different time scales. Ultra-logic objected that session spend is mutable and aggregate, while artifact payment is immutable and settlement-bound. Verdict: for implementation, they are different. They may share wallet/spend-permission infrastructure later, but artifact purchases must create receipt-bound settlement records.

## 3. Per-Area Hostile Findings — IN-SCOPE (#1, #3, #4, #5, #6 only)

### Area #1 — Token Efficiency Testing

**Damning issues:** Low-skeptic called the 90% savings claim marketing until baseline, model mix, prompt length, retries, and paid failures are defined. High-skeptic warned that synthetic before/after demos will corrupt future ranking and pitch claims. Ultra-logic found the analytics skeleton insufficient: reuse may be unique on `(consumer, attestation_id)`, repeated per-call value can collapse, and actual reuse cost can default to zero. Deep added that bad artifacts can create negative savings if buyers pay, inspect, discard, and rerun.

**Concrete acceptance fixes:** Token savings must be tied to actual usage/reuse events or controlled paired benchmarks. Track per-call, per-prompt, per-model dimensions; actual reuse cost; quality threshold; retries; latency; and confidence intervals. No universal 90% claim until fixed workloads prove it.

**Implementation skeleton (3-6 tasks):**
- Add `llm_usage_events` fields for model, prompt template version, task ID, adapter, token counts, latency, retries, and cost.
- Decide whether `data_reuse_events` measures unique buyer reuse or repeated per-call reuse; adjust schema accordingly.
- Build paired benchmark harness: same task with and without purchased artifact.
- Add quality rubric and pass/fail threshold before counting savings.
- Emit one canonical savings report per run with median and confidence interval.

### Area #3 — CLI + LLM-web Integration

**Damning issues:** High-skeptic said "Claude Code / Codex / web sessions" is hand-wavy unless exact hooks, auth, upload path, and wallet flow are named. Ultra-logic said a unified architecture is valid only as a common client protocol with separate adapters; npm, Claude Code, Codex, MCP, and web hooks do not share one extension surface. Low-skeptic warned that broad LLM-web support becomes a plugin platform.

**Concrete acceptance fixes:** Pick npm CLI first. No generic LLM-web integration in MVP. Future adapters must emit canonical events: artifact submitted, usage measured, quote accepted, receipt stored, delivery recorded. MVP artifact input supports structured JSON plus non-executable `SKILL.md`/prompt documents only.

**Implementation skeleton (3-6 tasks):**
- Implement `proofweave publish`, `search`, `preview`, `install`, and `stats` against real API flows.
- Add safe local auth/API-key/wallet config with explicit environment separation.
- Validate structured JSON and non-executable `SKILL.md` artifacts before publish.
- Store receipts locally/idempotently after purchase and use them for delivery/install.
- Define adapter event contract for future Claude Code/MCP/Codex integrations without implementing them now.

### Area #4 — Payment Upgrade

**Damning issues:** Deep found current `x402Gate.ts` is closer to CDP smart-wallet balance charging than standard x402 middleware. Ultra-logic found transfer can happen before quote consumption, so two concurrent requests can produce irreversible payment while only one gets a receipt. High-skeptic flagged that price-on-upload can be fail-open: attestation may succeed even if pricing fails, producing an unpriced/free artifact.

**Concrete acceptance fixes:** Name current flow honestly as ProofWeave wallet payment/operator-directed payment unless real `@x402/express` or `@x402/mcp` is integrated. Paid listing must require confirmed attestation plus immutable price snapshot. Quote/payment/receipt must be one replay-safe state machine.

**Implementation skeleton (3-6 tasks):**
- Add publication states: `draft -> encrypted_uploaded -> chain_confirmed -> priced/free -> listed`.
- Bind quotes to payer, artifact, creator, amount, currency, network, payTo, and TTL.
- Reserve/consume quote before transfer submission, or enforce durable idempotency key.
- Snapshot creator, gross price, protocol fee, creator net, and payTo into receipt/ledger.
- Add tx reconciliation and refund/recovery states for payment without receipt.

### Area #5 — Claim Contract + Smart-Wallet Outbound

**Damning issues:** Ultra-logic and high-skeptic agreed that a pull-payment claim contract contradicts offchain/operator-directed payments unless the payment sink changes to escrow/claim contract or each payment writes onchain settlement state. Deep said claim withdrawals are genuinely new, not duplicated wallet UX. High-skeptic warned creator balances can drift unless receipts, refunds, payout exports, and UI all reconcile to one append-only ledger.

**Concrete acceptance fixes:** Stage settlement. S0: operator-held attribution only. S1: manual/admin payout with reconciliation. S2: self-withdraw or claim contract after S1 proves accounting. Do not call DB balance claimable onchain. Operator USDC allocations must reconcile from immutable paid receipts and withdrawals.

**Implementation skeleton (3-6 tasks):**
- Add append-only creator attribution ledger from paid receipts.
- Add payout table with `pending`, `succeeded`, `failed`, and `reversed` states.
- Add manual payout export/script reconciled to actual operator USDC outflow.
- Add refunds and failed-settlement adjustments to the same ledger model.
- Design claim contract or signed-root withdrawal only after S1 payout data proves accounting.

### Area #6 — Security

**Damning issues:** Deep found the server can decrypt all artifacts, so ProofWeave cannot claim end-to-end privacy. Paid detail returns plaintext, so resale cannot be prevented after delivery. Deep also warned that strong payment logs can become perfect evidence of unsafe transactions if upload screening is weak. Ultra-logic added that envelope encryption improves IPFS bypass and key rotation, but not runtime server KEK compromise, operator custody, or payment split-brain.

**Concrete acceptance fixes:** MVP uploads are restricted to structured JSON plus non-executable `SKILL.md`/prompt documents. Split public manifest/preview from private encrypted artifact. Add upload screening, takedown, quarantine, audit logs, and scoped delivery entitlements. Target security review at payment/receipt/settlement and delivery, not the whole product fantasy.

**Implementation skeleton (3-6 tasks):**
- Add schema/type validation, byte caps, upload quotas, price caps, and no-PHI/PII/secrets beta terms.
- Store public manifest/preview separately from private encrypted payload.
- Move KEK to KMS/Vault with key versioning and rotation plan.
- Use short-lived delivery entitlement tied to payer, receiptId, artifactId, expiry, and max bytes.
- Add quarantine/takedown and audit logs for uploads, purchases, delivery, and payouts.
- Run targeted review for quote replay, payment/receipt split-brain, KEK compromise, API-key leakage, and custodial reconciliation.

## 4. Area #7 — Directional Options (no implementation)

**Option A:** Treat prompts, skills, recipes, workflow traces, and raw datasets as distinct listing kinds while keeping one attestation/payment substrate. Thesis: buyer demand may concentrate on reusable agent artifacts rather than raw data. Validation experiment: seed 10 listings each for `prompt`, `skill`, `recipe`, and `raw_dataset`; measure preview-to-quote and quote-to-purchase in one week. Risks: category work can become taxonomy theater if purchase volume is too low.

**Option B:** Test raw vs. derivative packaging for the same source material. Thesis: buyers may prefer cleaned derivative bundles or prompt/workflow summaries over provenance-rich raw bundles. Validation experiment: publish paired raw-only and derivative-first listings at different prices; compare click-through, quote rate, purchase, and refund/confusion. Risks: raw data has higher legal/PII exposure and may produce misleading low demand if samples are poor.

**Option C:** Test data-market framing against prompt/skill marketplace framing. Thesis: positioning may matter more than underlying artifact storage. Validation experiment: run two landing/search category variants for the same listings, one "data market" and one "reusable agent assets," and compare click-to-quote and quote-to-purchase. Risks: homepage tests are noisy before enough inventory exists.

**Option D:** Add one post-purchase outcome probe. Thesis: the niche thesis only matters if artifacts replace LLM/web research calls. Validation experiment: after receipt, ask "Did this replace an LLM/web research call?" plus estimated avoided call size; correlate with reuse/refund. Risks: self-report is noisy and gameable.

## 5. Big Contradictions To Resolve

(a) Claim contract vs. offchain x402: This is an architectural fork. Current wiring supports operator-custodial attribution: buyers pay operator, receipts accrue creator balances, operator later pays creators. A pure pull-payment claim contract is incompatible unless `payTo` changes to escrow/claim contract or each payment writes durable onchain settlement. Recommended path: S0 operator-held, S1 manual payout, S2 claim/self-withdraw after accounting is proven.

(b) Session payment vs. agent payment: They are not the same primitive for implementation. Session payment is budgeted, mutable, partially consumed, expirable, and refundable. Artifact payment is immutable and receipt-bound to payer, content hash, creator, price snapshot, and settlement accrual. They may share wallet/spend-permission infrastructure later.

(c) "CLI is the product" reframe: The gain is focus, a real developer workflow, and fewer web distractions. The loss is weaker support for non-terminal buyers and less marketplace browsing. Verdict: CLI-first for MVP, with minimal web/admin for ops and billing only. Do not let CLI-first become catalog-first.

(d) EIP-8004 readiness: Not production-grade enough to depend on here, and excluded from implementation. Interim: keep reputation/rating as future receipt-bound fields if cheap, but do not let payment, delivery, settlement, or ranking rely on it.

## 6. Recommended Execution Order (waves)

Wave 1: Freeze decisions and schemas. Tasks: choose operator-custodial S0 language (#4/#5, unspecified-high, parallelizable N); define receipt/ledger/payout schemas and invariants (#4/#5, ultrabrain, parallelizable N); settle MVP artifact boundary as structured JSON plus non-executable `SKILL.md` (#3/#6, deep, parallelizable N).

Wave 2: Harden money and listing state. Tasks: implement publication/pricing state machine (#4, unspecified-high, parallelizable Y); implement quote reservation/idempotency before transfer (#4, ultrabrain, parallelizable N); add immutable creator attribution ledger (#5, ultrabrain, parallelizable N); add reconciliation for tx, receipt, refunds, and operator balance (#4/#5, deep, parallelizable Y after ledger).

Wave 3: Harden delivery and content risk. Tasks: split manifest/preview from encrypted payload (#6, deep, parallelizable Y); add JSON and `SKILL.md` validators (#3/#6, quick, parallelizable Y); add scoped delivery entitlements (#6, unspecified-high, parallelizable Y); add quarantine/takedown/audit logs (#6, deep, parallelizable Y).

Wave 4: Ship first CLI loop. Tasks: `publish`, `search`, `preview`, `install`, `stats` (#3, quick + artistry, parallelizable Y after API contracts); local receipt storage/idempotent repurchase (#3/#4, quick, parallelizable Y); creator bank-statement stats (#5, visual-engineering, parallelizable Y).

Wave 5: Instrument token economics. Tasks: expand usage/reuse schema (#1, deep, parallelizable Y); build paired benchmark harness (#1, unspecified-high, parallelizable Y); publish canonical savings report (#1, quick, parallelizable Y).

Wave 6: Payout rehearsal and review. Tasks: manual payout export/script (#5, deep, parallelizable N); targeted security review of payment/delivery/custody (#6, deep, parallelizable N); decide S2 claim-contract design only after S1 data (#5, ultrabrain, parallelizable N).

## 7. Top 5 Blockers — Open Questions for User

1. Is MVP explicitly operator-custodial with admin payout, or must funds route to escrow/claim contract from day one?
2. Can the current payment path be named "ProofWeave wallet payment" until real x402 middleware is integrated?
3. Is npm CLI the only V1 integration target, with Claude Code/Codex/MCP deferred to adapters?
4. Do you accept the final artifact boundary: structured JSON plus non-executable `SKILL.md`/prompt documents only, no arbitrary files, no callable execution?
5. Will you accept explicit beta terms and UI copy: no PHI/PII/secrets, takedown/quarantine rights, and creator balances labeled "held by operator / pending admin payout" until S2?
