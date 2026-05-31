# Area #1 (Token Efficiency Testing) + Area #7 (Niche + Reputation) — Revision

## Area #1 — Token Efficiency Testing

### Revised damning issues (post-pivot)

- Direct vault claim makes token efficiency the economic proof, not a dashboard ornament. If creators are going straight to claimable revenue, buyers need evidence that purchasing a listing is cheaper than recreating it with Claude Code. A fake savings number now poisons pricing, ranking, payout legitimacy, and the pitch.
- Claude Code hook harness is not just an integration surface; it is the one place ProofWeave can measure savings at the source. It can see the agent task, the would-have-been prompt, the purchased artifact, retries, latency, and whether the bought artifact actually avoided an LLM call. If this is not instrumented there, the team is choosing self-report bias on purpose.
- Synthetic before/after demos are still the obvious way to lie to yourselves. A handpicked “without ProofWeave” prompt that is bloated by design proves nothing. A marketplace cannot be priced on screenshots of cherry-picked savings.
- Savings cannot be token-only. A purchased skill that saves tokens but causes retries, bad output, or manual repair is negative value. Count savings only when quality passes a rubric and the agent run actually completes.
- Model variance matters. A prompt that saves tokens on Claude Sonnet may be worthless on GPT-4.1 or Gemini. Per-model and per-template aggregation is mandatory, not analytics polish.

### What changes vs the original critique

The original critique treated token efficiency as backend analytics plus purchase-event correlation. Post-pivot, the Claude Code hook harness becomes the measurement instrument. Before each “would-have-LLM-call,” the harness should capture the intended prompt/template, estimated input/output tokens, model, task type, and expected artifact type. If the harness chooses to buy from ProofWeave instead, it records purchase price, listing kind, access receipt, latency, retries, and downstream completion status. The comparison is no longer “seller claims this artifact saves tokens”; it is “this exact agent run avoided this exact projected call and completed with this purchased artifact.” That eliminates the worst self-report bias and turns the first CLI surface into the experimental rig.

The danger is measurement theater. Token estimates are not actual bills unless tied to provider-reported usage or a calibrated tokenizer. Purchase cost is not token cost unless converted consistently. “Savings” must include failed purchases, retries, low-quality artifacts, and timeouts. If the harness only logs successful happy paths, the system will overstate savings by design.

### Concrete repo touchpoints

- `api/src/db/migrate.ts` already has `llm_usage_events`, `attestation_token_baselines`, and `data_reuse_events`. Do not create a parallel analytics schema; extend these tables so historic dashboard paths do not fork.
- `api/src/services/analytics.ts` is the likely home for canonical savings calculations. If savings math lands in routes, frontend, and CLI separately, the numbers will diverge within a week.
- `api/src/routes/ai.ts` already records LLM usage for `/ai/analyze`; reuse its accounting pattern, but do not pretend API-side analysis events equal Claude Code hook events.
- `api/src/routes/attestations.ts` records reuse on paid detail access. That should become the bridge between receipts and measured savings.
- `api/src/routes/stats.ts`, `api/src/routes/purchases.ts`, and `web/src/pages/AnalyticsPage.tsx` are downstream consumers only. They should read canonical reports, not recompute savings.
- The Claude Code hook harness is new surface area. Keep its event contract boring: signed/authorized API key, hook event ID, prompt/template hash, model, token estimate, receipt ID, result status.

### Dependencies and sequencing traps

- Depends on payment receipts being stable. If vault claim or x402 receipt semantics change mid-build, savings events lose their anchor.
- Depends on listing kind taxonomy from Area #7. Token savings by “blob” is meaningless; savings by `prompt`, `skill`, `recipe`, and `raw_dataset` is actionable.
- Depends on one Claude Code hook target first. Do not generalize instrumentation for Codex/web/other CLIs until one harness produces clean data.
- Blocks credible composite ranking. If measured savings is fake, ranking will amplify fake quality.

### Implementation tasks

1. **Schema hardening for `llm_usage_events` and reuse events.** Extend usage records with model, provider, prompt template ID/hash, listing kind, estimated input/output tokens, actual provider usage when available, actual LLM cost, ProofWeave purchase cost, retries, latency, completion status, quality status, and savings fields. Existing tables are a start, not enough.
2. **Hook-side before/after capture in Claude Code.** Add instrumentation before a candidate LLM call, then record whether the harness bought an artifact, used it, retried, fell back to direct LLM, or abandoned the task. No hook event, no published savings.
3. **Paired benchmark harness.** Maintain fixed workloads with known task inputs and target outputs. Each workload should run both “direct LLM” and “ProofWeave purchase” modes under controlled model/template settings.
4. **Quality rubric gate.** Define pass/fail thresholds per listing kind: prompt, skill, recipe, raw dataset. Savings count only if the resulting task passes the rubric. Failed quality gets logged as negative or zero savings.
5. **Canonical savings report endpoint.** Produce one backend endpoint that reports median, confidence interval, sample size, and failure rate per model, prompt template, listing kind, and time window. Kill every ad hoc dashboard calculation.
6. **CLI `stats` consumer.** The Claude Code harness should expose `stats` output that reads the canonical report, not local guesswork.

### Acceptance criteria

- 100+ real purchases with measured hook-side savings data, not hand-authored demo rows.
- Median and 95% confidence interval reported per model and per prompt-template/listing-kind bucket, with sample size visible.
- Zero synthetic data in published numbers. Synthetic benchmarks may exist only in a separate labeled benchmark report.
- Every counted savings event links to a purchase receipt, a hook event, a prompt/template hash, and a quality pass.
- Failed purchases, retries, fallback-to-LLM events, and low-quality artifacts are included in denominator metrics.
- Dashboard and CLI numbers match the canonical report endpoint exactly.

## Area #7 + Reputation — Merged Track

### Revised thesis (post-user clarification)

Data ranking is a function of EIP-8004 agent reputation plus web user ratings. Niche content is not the same thing as reputation. Do not blur them because it will create an unusable design.

The content decision is: ProofWeave should sell reusable prompts, skills, and recipes instead of pretending arbitrary raw blobs have obvious market value. The ranking decision is: once those listings exist, sort them using buyer feedback, purchase behavior, recency, and any available agent reputation signal. Content primitives define what is being sold. Reputation defines why the buyer should trust it. Mixing those into one mushy “quality score” guarantees nobody can debug ranking.

### Critical questions about EIP-8004 (validate with deep's research)

- Is EIP-8004 production-grade right now? If it is still Draft/Review rather than Final, ProofWeave should not put the MVP ranking path behind it. Use a feature flag and bridge/stub.
- What is the integration shape: consume reputation from external registries, issue ProofWeave attestations as a reputation attestor, or deploy project-owned registry contracts? Those are different systems.
- What is the onchain storage and gas cost per reputation action? If every rating or listing interaction writes onchain, the product dies under its own ceremony.
- Does the current UUPS `AttestationRegistry` have business being involved? No, unless deep proves otherwise. It is provenance-only. Appending a few fields may be technically possible, but cramming agent identity/reputation/validation into it is storage-layout risk and conceptual rot.
- Can ProofWeave issue reputation from its own purchase receipts, or only consume EIP-8004 scores from agents registered elsewhere? If ProofWeave issues, it becomes an attestor with governance, dispute, and slashing questions. If it consumes, cold-start and missing-data behavior dominate V1.

### Web rating system design

Use receipt-gated ratings only. If a wallet did not buy or access the listing through a valid receipt, it does not rate. Anonymous public likes are spam with nicer CSS.

Use one rating type in V1: a binary thumbs-up/thumbs-down plus optional short reason. Numeric stars look precise and invite fake granularity; structured multidimensional reviews are too much surface area before there is inventory. Binary ratings are easier to explain, harder to overfit, and enough to power ranking once combined with purchase count and recency.

Display two aggregates: per-listing rating and per-creator rating. Per-listing answers “should I buy this artifact?” Per-creator answers “has this seller shipped useful artifacts before?” Keep them visually separate. A creator with one viral listing should not make every future listing look proven.

Anti-collusion cannot be handwaved. Minimum rater diversity should gate “trusted aggregate” display: for example, do not show a strong quality badge until at least N unique non-creator buyers have rated, with buyer/creator wallet separation and wash-trade heuristics. This will not stop determined fraud, but it prevents the dumbest leaderboard poisoning.

### Composite ranking formula (proposal, not final)

Start with an explicit, tunable formula:

`score = α * web_rating_avg + β * eip_8004_score + γ * log(1 + verified_purchase_count) + δ * recency_decay + ε * measured_savings_quality`

The dials matter:

- `α` should dominate early if EIP-8004 is absent or sparse, but only after minimum rater diversity.
- `β` should be feature-flagged until EIP-8004 integration is proven and normalized. Do not let a missing external score become a penalty for every normal seller.
- `γ` rewards market validation but must be log-scaled to avoid rich-get-richer sorting.
- `δ` prevents stale artifacts from squatting forever.
- `ε` connects Area #1 to ranking: listings with measured savings and quality passes deserve lift.

This formula is not sacred. The point is to make ranking inspectable. If the team ships an opaque “AI quality ranker,” every bad search result becomes undebuggable.

### Niche content categorization

Connect listings to concrete kinds:

- `skill`: a `SKILL.md`-style non-executable instruction bundle for an agent or coding workflow.
- `prompt`: a system/developer/user prompt template with variables and intended model/task.
- `recipe`: a workflow template chaining prompts, tools, retrieval, checks, or verification steps.
- `raw_dataset`: legacy or supporting data, not the hero product.

Each kind needs different ranking weights. A `skill` should care more about creator reputation and measured completion success. A `prompt` should care more about per-template savings and user rating. A `recipe` should care about repeatability and latency/retry rate. A `raw_dataset` should probably rank lower unless attached to a proven recipe or benchmark.

### V1 implementation tasks

1. **DB: `web_ratings` table tied to receipts.** Fields: rating ID, receipt ID, attestation/listing ID, rater wallet, creator wallet, binary rating, reason, created_at, updated_at, and uniqueness constraint per receipt/listing.
2. **API: receipt-gated `POST /ratings`.** Validate receipt ownership, prevent creator self-rating, enforce one active rating per purchase, and return clear conflict errors.
3. **API: `GET /listings?sort=composite`.** Return listing kind, rating aggregates, purchase count, measured savings summary, EIP-8004 feature status, and composite score explanation/debug fields.
4. **Frontend rating UI.** Put rating after purchase/access on the listing or explorer detail page. Do not ask non-buyers to rate.
5. **EIP-8004 integration stub.** Feature-flag the external reputation component. If deep confirms the standard is not ready, ship `β=0` and expose “external reputation unavailable,” not fake reputation.
6. **Ranking service with caching.** Compute composite scores deterministically, cache them, and invalidate on purchase, rating, listing update, or reputation refresh.
7. **Listing kind taxonomy.** Add kind selection at upload and filters in search. Force one of `skill`, `prompt`, `recipe`, `raw_dataset`; do not allow “miscellaneous” to become the garbage pile.

### Concrete repo touchpoints

- `api/src/db/migrate.ts` needs `web_ratings`, listing-kind columns/indexes, cached ranking fields or a ranking materialization table, and any EIP-8004 mapping table. Keep these additive; do not mutate the provenance contract to store marketplace ranking.
- `api/src/routes/attest.ts` is where listing kind should be set on upload. If kind is inferred later by metadata alone, sellers will game it and buyers will not know what they are buying.
- `api/src/routes/attestations.ts` owns `/search` and `/search/facets`; this is the natural place to add `sort=composite`, kind filters, and ranking explanation fields.
- `api/src/routes/purchases.ts` and `access_receipts` in `api/src/db/migrate.ts` are the gate for rating eligibility. Ratings not tied to receipts are spam, full stop.
- `web/src/pages/ExplorerPage.tsx`, `web/src/components/AttestationCard.tsx`, and `web/src/components/AttestationPurchaseModal.tsx` are the visible rating/ranking surfaces. The UI must show why an item ranked high, not just a magic score.
- `src/AttestationRegistry.sol` should remain provenance-only. EIP-8004 consumption/bridging belongs in a separate service/adapter or separate contracts if deep proves onchain is required.

### Dependencies and sequencing traps

- Depends on Area #1 for measured savings. Do not let synthetic benchmark savings influence ranking.
- Depends on direct vault claim design because wash-trading incentives get worse when highly rated listings can immediately drive claimable revenue.
- Depends on EIP-8004 readiness research. If the standard is not production-grade, `β=0` and rating-only V1 ships behind an explicit feature flag.
- Depends on the excluded prompt-guard teammate work only as future spam mitigation. Do not block V1 ranking on it; just assume bad content will enter and make ranking resilient.

### Honest open questions

- If EIP-8004 is not ready, does V1 ship rating-only ranking with a feature-flagged reputation column? It should, unless the user wants to stall the whole product on a standard still moving underfoot.
- Who arbitrates rating disputes? If there is no answer, ratings are buyer opinion, not truth. Say that in the UI.
- Is the user committing to 3-4 listing kinds in V1? If not, token-efficiency instrumentation cannot segment results correctly.
- Are ratings attached to attestations, listings, creators, agents, or all of them? Pick the primary entity now or migrations will be ugly.
- Will ProofWeave ever write reputation onchain, or only read it? This decides whether the team is building a marketplace or a reputation protocol.

### Risks

- **Cold start:** no purchases means no ratings and no trustworthy ranking. Fallback must be recency, curated picks, or measured benchmark quality, not fake composite scores.
- **Wash trading:** buyer equals creator alt account, buys cheaply, rates highly, climbs ranking, claims payout. Receipt-gating alone does not solve this.
- **EIP-8004 scope creep:** integrating identity, validation, and reputation registries can swallow the MVP. Keep it feature-flagged until production viability is proven.
- **Ranking opacity:** if users cannot see why a listing ranked high, bad results will look like manipulation.
- **Kind confusion:** if prompts, skills, recipes, and raw datasets share identical ranking weights, the market will reward noisy popular blobs over useful reusable workflows.
- **Metric contamination:** if synthetic benchmark savings flow into composite ranking, sellers will optimize for fake benchmark wins instead of buyer value.
