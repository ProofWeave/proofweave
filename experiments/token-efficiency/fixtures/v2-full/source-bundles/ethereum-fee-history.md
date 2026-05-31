# Raw Source Bundle: Ethereum EIP-1559 Fee History Dataset

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: onchain_fee_measurement
Problem type: fee_history
Listing id: att_fee_ethereum_fee_history
Last refreshed for fixture: 2026-05-07T00:00:00Z

## Source URLs

- https://ethereum.org/en/developers/docs/gas/
- https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_feehistory

## Extraction Notes

1. EIP-1559 transaction pricing separates base fee, max priority fee, and max fee.
2. The base fee changes per block and is burned, while priority fee compensates validators.
3. The eth_feeHistory method returns block base fee values and optional reward percentile arrays.
4. A fee estimator should record block range, percentile choices, and fallback behavior when rewards are sparse.
5. Do not mix wei, gwei, and ETH units without explicit conversion metadata.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | onchain_fee_measurement | EIP-1559 transaction pricing separates base fee, max priority fee, and max fee. | keep |
| S2 | onchain_fee_measurement | The base fee changes per block and is burned, while priority fee compensates validators. | keep |
| S3 | onchain_fee_measurement | The eth_feeHistory method returns block base fee values and optional reward percentile arrays. | keep |
| S4 | onchain_fee_measurement | A fee estimator should record block range, percentile choices, and fallback behavior when rewards are sparse. | keep |
| S5 | onchain_fee_measurement | Do not mix wei, gwei, and ETH units without explicit conversion metadata. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: eth_feeHistory, baseFeePerGas, reward percentiles, maxPriorityFeePerGas, maxFeePerGas.
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
- Collect `eth_feeHistory` over a fixed block window and store the block range.
- Use `baseFeePerGas` for the base fee path and reward percentiles for priority-fee evidence.
- Report `maxPriorityFeePerGas` and `maxFeePerGas` separately.
- Normalize units to wei and display gwei only as a derived view.
- Flag sparse reward arrays instead of forward-filling missing priority fee evidence.
