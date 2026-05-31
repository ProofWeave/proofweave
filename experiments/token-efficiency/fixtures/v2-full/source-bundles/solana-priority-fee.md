# Raw Source Bundle: Solana Priority Fee Measurement Skill

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: onchain_fee_measurement
Problem type: fee_estimation
Listing id: att_fee_solana_priority_fee
Last refreshed for fixture: 2026-05-08T00:00:00Z

## Source URLs

- https://solana.com/docs/core/fees
- https://solana.com/docs/rpc/http/getrecentprioritizationfees

## Extraction Notes

1. Solana fee calculation separates the base signature fee from optional prioritization fees.
2. The prioritization fee is based on compute unit price and compute unit limit, expressed in micro-lamports.
3. Recent prioritization fees are RPC observations and should be treated as recent local market evidence, not a guarantee.
4. Compute budget instructions should be inserted before transaction execution so the scheduler sees the intended price and limit.
5. Jito tips are separate from the native prioritization fee and should not be double counted.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | onchain_fee_measurement | Solana fee calculation separates the base signature fee from optional prioritization fees. | keep |
| S2 | onchain_fee_measurement | The prioritization fee is based on compute unit price and compute unit limit, expressed in micro-lamports. | keep |
| S3 | onchain_fee_measurement | Recent prioritization fees are RPC observations and should be treated as recent local market evidence, not a guarantee. | keep |
| S4 | onchain_fee_measurement | Compute budget instructions should be inserted before transaction execution so the scheduler sees the intended price and limit. | keep |
| S5 | onchain_fee_measurement | Jito tips are separate from the native prioritization fee and should not be double counted. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: getRecentPrioritizationFees, SetComputeUnitPrice, SetComputeUnitLimit, micro-lamports, prioritization fee.
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
- Query `getRecentPrioritizationFees` for recent local fee evidence.
- Set the compute unit limit with `SetComputeUnitLimit` based on simulation plus margin.
- Set the compute unit price with `SetComputeUnitPrice` in micro-lamports.
- Estimate prioritization fee as compute unit price times compute unit limit divided by 1,000,000.
- Track Jito tips separately from native prioritization fee fields.
