# Kraken OHLC and Trades Reconciliation Dataset

Listing id: att_market_kraken_ohlc_trades
Domain: market_timeseries
Kind: curated_dataset

## Use When

Use this artifact when the query asks for ohlc_reconciliation in the market_timeseries
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Use Kraken OHLC rows with pair, interval, timestamp, open, high, low, close, volume, and count.
- Join recent trades by pair and timestamp window, keeping the `last` cursor for reproducibility.
- Recompute candle fields from trades and report differences.
- Emit a gap list for missing intervals instead of forward-filling.
- Keep exchange bucket boundaries explicit.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
