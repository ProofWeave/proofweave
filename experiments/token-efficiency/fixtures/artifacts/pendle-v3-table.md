# DATASET: Pendle V3 PT/YT Maturity Matrix (2026-04-28)

Curated maturity matrix. Source evidence: see linked raw bundle.

## Maturities

| Asset | Maturity | Days | Implied APY | PT discount | LP TVL |
|---|---|---|---|---|---|
| sUSDe | 2026-06-26 | 59 | 18.4% | 2.91% | 41.2M |
| sUSDe | 2026-09-25 | 150 | 16.8% | 6.74% | 23.7M |
| sUSDe | 2027-03-26 | 332 | 14.2% | 12.43% | 14.0M |
| weETH | 2026-06-26 | 59 | 7.1% | 1.13% | 38.9M |
| weETH | 2026-09-25 | 150 | 6.8% | 2.74% | 22.1M |
| ezETH | 2026-09-25 | 150 | 6.4% | 2.59% | 7.4M |
| rsETH | 2026-09-25 | 150 | 6.0% | 2.43% | 5.1M |
| USDe | 2026-06-26 | 59 | 11.0% | 1.76% | 18.2M |
| USDe | 2026-09-25 | 150 | 10.4% | 4.21% | 11.5M |

## Realized 30d APY

- sUSDe 23.1%, weETH 4.8%, ezETH 4.5%, rsETH 4.4%, USDe 9.2%.

## Net call (point in time, 2026-04-28)

- sUSDe 60d, 150d: YT favored (realized over implied).
- weETH 60d: PT favored (implied over realized).

## Notes

- V3 pools per-maturity, no proxy upgrade risk.
- Frontend APY cached 60s. Use on-chain oracle for execution.
- Arbitrum withdrawals: 7-day canonical-bridge lag.
