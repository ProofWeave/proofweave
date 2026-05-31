# Raw Source Bundle: Kraken OHLC and Trades Reconciliation Dataset

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: market_timeseries
Problem type: ohlc_reconciliation
Listing id: att_market_kraken_ohlc_trades
Last refreshed for fixture: 2026-05-05T00:00:00Z

## Source URLs

- https://docs.kraken.com/api/docs/rest-api/get-ohlc-data/
- https://docs.kraken.com/api/docs/rest-api/get-recent-trades/

## Extraction Notes

1. OHLC candles summarize trades over a fixed interval, but trade endpoints expose individual events and pagination cursors.
2. A reconciliation dataset should store pair, interval, start timestamp, end timestamp, and the last cursor.
3. Open, high, low, close, volume, and trade count should be recomputed from trades where possible.
4. Missing intervals should be reported as gaps rather than silently forward-filled.
5. Clock alignment matters because exchange candles may use exchange-side bucket boundaries.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | market_timeseries | OHLC candles summarize trades over a fixed interval, but trade endpoints expose individual events and pagination cursors. | keep |
| S2 | market_timeseries | A reconciliation dataset should store pair, interval, start timestamp, end timestamp, and the last cursor. | keep |
| S3 | market_timeseries | Open, high, low, close, volume, and trade count should be recomputed from trades where possible. | keep |
| S4 | market_timeseries | Missing intervals should be reported as gaps rather than silently forward-filled. | keep |
| S5 | market_timeseries | Clock alignment matters because exchange candles may use exchange-side bucket boundaries. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: OHLC, trades, interval, last cursor, volume weighted average.
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
- Use Kraken OHLC rows with pair, interval, timestamp, open, high, low, close, volume, and count.
- Join recent trades by pair and timestamp window, keeping the `last` cursor for reproducibility.
- Recompute candle fields from trades and report differences.
- Emit a gap list for missing intervals instead of forward-filling.
- Keep exchange bucket boundaries explicit.
