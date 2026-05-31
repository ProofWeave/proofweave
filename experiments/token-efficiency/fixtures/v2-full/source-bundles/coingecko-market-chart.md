# Raw Source Bundle: CoinGecko Market Chart Normalization Recipe

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: market_timeseries
Problem type: market_chart
Listing id: att_market_coingecko_chart
Last refreshed for fixture: 2026-05-04T00:00:00Z

## Source URLs

- https://docs.coingecko.com/reference/coins-id-market-chart
- https://docs.coingecko.com/reference/coins-id-market-chart-range

## Extraction Notes

1. Market chart endpoints commonly return arrays of timestamp-value pairs for prices, market caps, and total volumes.
2. Normalization must keep the asset id, quote currency, timestamp unit, and range parameters.
3. The chart range endpoint is a better fixture for reproducible windows than a moving days parameter.
4. Missing values should be marked and excluded from return calculations unless a fill policy is declared.
5. Rate-limit metadata and cache time should be stored outside the time series rows.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | market_timeseries | Market chart endpoints commonly return arrays of timestamp-value pairs for prices, market caps, and total volumes. | keep |
| S2 | market_timeseries | Normalization must keep the asset id, quote currency, timestamp unit, and range parameters. | keep |
| S3 | market_timeseries | The chart range endpoint is a better fixture for reproducible windows than a moving days parameter. | keep |
| S4 | market_timeseries | Missing values should be marked and excluded from return calculations unless a fill policy is declared. | keep |
| S5 | market_timeseries | Rate-limit metadata and cache time should be stored outside the time series rows. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: market_chart, prices, market_caps, total_volumes, range.
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
- Normalize `prices`, `market_caps`, and `total_volumes` as timestamp-value series.
- Prefer `market_chart/range` for fixed benchmark windows.
- Store asset id, quote currency, timestamp unit, and requested range.
- Do not compute returns across missing values unless a fill policy is declared.
- Keep API cache or rate-limit notes outside the data rows.
