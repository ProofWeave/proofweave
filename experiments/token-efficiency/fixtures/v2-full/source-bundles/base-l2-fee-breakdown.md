# Raw Source Bundle: Base L2 Fee Breakdown Recipe

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: onchain_fee_measurement
Problem type: l2_fee_breakdown
Listing id: att_fee_base_l2_breakdown
Last refreshed for fixture: 2026-05-06T00:00:00Z

## Source URLs

- https://docs.base.org/
- https://docs.optimism.io/stack/transactions/fees

## Extraction Notes

1. OP Stack chains expose transaction costs that include L2 execution and an L1 data component.
2. Receipt-only measurement should preserve gas used, effective gas price, and any L1 fee fields exposed by the RPC.
3. A benchmark fixture should include a receipt snapshot, calldata size note, and a chain id.
4. Comparisons across chains must not assume the same base fee mechanics as Ethereum L1.
5. The artifact should say which fields are measured and which are inferred.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | onchain_fee_measurement | OP Stack chains expose transaction costs that include L2 execution and an L1 data component. | keep |
| S2 | onchain_fee_measurement | Receipt-only measurement should preserve gas used, effective gas price, and any L1 fee fields exposed by the RPC. | keep |
| S3 | onchain_fee_measurement | A benchmark fixture should include a receipt snapshot, calldata size note, and a chain id. | keep |
| S4 | onchain_fee_measurement | Comparisons across chains must not assume the same base fee mechanics as Ethereum L1. | keep |
| S5 | onchain_fee_measurement | The artifact should say which fields are measured and which are inferred. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: L1 data fee, L2 execution fee, receipt, calldata, OP Stack.
It should also preserve domain-specific caveats and avoid converting source notes
into unsupported claims. The raw bundle includes repeated context so the benchmark
has enough input size to expose whether source-bundle workflows become expensive
relative to curated artifacts.

Operational checklist:
- Confirm source URL still resolves before paid live runs.
- Confirm exact provider model id before paid live runs.
- Confirm raw context and artifact context are both fed through the same prompt wrapper.
- Confirm no-match queries are excluded from token-saving success calculations.
- Confirm quality score is reported next to token reduction, not hidden in notes.

Negative control reminders:
- Do not answer with a different domain just because a keyword overlaps.
- Do not treat source-note summaries as legal, financial, or security advice.
- Do not invent source fields that are absent from the source bundle.
- Do not claim provider billing savings from local tokenizer counts alone.

## Artifact Compression Target

The artifact should keep the following reusable facts:
- Break Base transaction cost into L2 execution fee and L1 data fee when fields are available.
- Store transaction receipt, chain id, gas used, effective gas price, and calldata size.
- Mark OP Stack fee fields as measured evidence rather than generic Ethereum L1 estimates.
- Compare fee samples only over the same chain and time window.
- Do not merge L1 data fee into priority fee without naming the transformation.
