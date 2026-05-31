# Raw Source Bundle: Uniswap v3 Liquidity Time Series Dataset

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: market_timeseries
Problem type: defi_timeseries
Listing id: att_market_uniswap_v3_liquidity
Last refreshed for fixture: 2026-05-03T00:00:00Z

## Source URLs

- https://docs.uniswap.org/
- https://thegraph.com/docs/

## Extraction Notes

1. DeFi pool time series should include pool address, chain id, token decimals, timestamp, liquidity, price, and volume fields.
2. Uniswap v3 liquidity interpretation depends on ticks and token decimals.
3. Subgraph snapshots can lag chain state, so block number and indexed timestamp should be stored.
4. TVL calculations should name the quote asset and pricing source.
5. Cross-pool comparisons must normalize decimals and chain id before aggregation.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | market_timeseries | DeFi pool time series should include pool address, chain id, token decimals, timestamp, liquidity, price, and volume fields. | keep |
| S2 | market_timeseries | Uniswap v3 liquidity interpretation depends on ticks and token decimals. | keep |
| S3 | market_timeseries | Subgraph snapshots can lag chain state, so block number and indexed timestamp should be stored. | keep |
| S4 | market_timeseries | TVL calculations should name the quote asset and pricing source. | keep |
| S5 | market_timeseries | Cross-pool comparisons must normalize decimals and chain id before aggregation. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: poolDayData, liquidity, sqrtPrice, tick, TVL.
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
- Use `poolDayData` style rows with pool address, chain id, timestamp, liquidity, volume, and TVL.
- Normalize token decimals before comparing liquidity or volume.
- Store block number or indexed timestamp to identify subgraph lag.
- Include `sqrtPrice` or tick context when price interpretation matters.
- Name the quote asset and pricing source for TVL.
