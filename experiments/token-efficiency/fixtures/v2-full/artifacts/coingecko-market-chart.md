# CoinGecko Market Chart Normalization Recipe

Listing id: att_market_coingecko_chart
Domain: market_timeseries
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for market_chart in the market_timeseries
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Normalize `prices`, `market_caps`, and `total_volumes` as timestamp-value series.
- Prefer `market_chart/range` for fixed benchmark windows.
- Store asset id, quote currency, timestamp unit, and requested range.
- Do not compute returns across missing values unless a fill policy is declared.
- Keep API cache or rate-limit notes outside the data rows.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
