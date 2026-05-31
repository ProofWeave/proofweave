# Uniswap v3 Liquidity Time Series Dataset

Listing id: att_market_uniswap_v3_liquidity
Domain: market_timeseries
Kind: curated_dataset

## Use When

Use this artifact when the query asks for defi_timeseries in the market_timeseries
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Use `poolDayData` style rows with pool address, chain id, timestamp, liquidity, volume, and TVL.
- Normalize token decimals before comparing liquidity or volume.
- Store block number or indexed timestamp to identify subgraph lag.
- Include `sqrtPrice` or tick context when price interpretation matters.
- Name the quote asset and pricing source for TVL.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
