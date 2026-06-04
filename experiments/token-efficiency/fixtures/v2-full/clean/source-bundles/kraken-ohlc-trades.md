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
