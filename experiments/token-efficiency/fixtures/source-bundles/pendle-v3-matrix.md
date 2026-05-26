# Pendle V3 PT/YT Maturity Matrix (raw 2026-04-28)

> Raw evidence pack. Combines Pendle V3 documentation snapshot 2026-04,
> on-chain PT/YT pool data pulled from Etherscan and Arbiscan between
> 2026-04-01 and 2026-04-28, and Pendle's official APY methodology.

## 1. Concepts

Pendle splits a yield-bearing asset into:

- PT (Principal Token) — redeems 1:1 for the underlying at maturity.
- YT (Yield Token) — accrues the yield until maturity, then expires worthless.
- LP — provides liquidity between PT and the underlying in the AMM.

Implied APY:

```
implied_yield_apy = (1 - PT_price / 1 underlying) / time_to_maturity_years
```

PT discount widens with implied yield. Buying PT is equivalent to locking
in a fixed yield to maturity; buying YT is equivalent to a leveraged bet
on realized yield exceeding implied yield.

## 2. Maturities live on 2026-04-28

| Asset | Pool | Maturity | Days | Implied APY | PT discount | LP TVL (USD) |
|---|---|---|---|---|---|---|
| sUSDe | Ethereum 0xPT-sUSDe-26JUN26 | 2026-06-26 | 59 | 18.4% | 2.91% | 41.2M |
| sUSDe | Ethereum 0xPT-sUSDe-25SEP26 | 2026-09-25 | 150 | 16.8% | 6.74% | 23.7M |
| sUSDe | Ethereum 0xPT-sUSDe-26MAR27 | 2027-03-26 | 332 | 14.2% | 12.43% | 14.0M |
| weETH | Ethereum 0xPT-weETH-26JUN26 | 2026-06-26 | 59 | 7.1% | 1.13% | 38.9M |
| weETH | Ethereum 0xPT-weETH-25SEP26 | 2026-09-25 | 150 | 6.8% | 2.74% | 22.1M |
| ezETH | Arbitrum 0xPT-ezETH-25SEP26 | 2026-09-25 | 150 | 6.4% | 2.59% | 7.4M |
| rsETH | Arbitrum 0xPT-rsETH-25SEP26 | 2026-09-25 | 150 | 6.0% | 2.43% | 5.1M |
| USDe | Ethereum 0xPT-USDe-26JUN26 | 2026-06-26 | 59 | 11.0% | 1.76% | 18.2M |
| USDe | Ethereum 0xPT-USDe-25SEP26 | 2026-09-25 | 150 | 10.4% | 4.21% | 11.5M |

## 3. Underlying-yield realizations

Realized 30d underlying APY as of 2026-04-28:

- sUSDe: 23.1%
- weETH: 4.8%
- ezETH: 4.5%
- rsETH: 4.4%
- USDe: 9.2%

YT carry implied:

- sUSDe (60d): realized 23.1% versus implied 18.4% — YT slightly favored.
- sUSDe (150d): realized 23.1% versus implied 16.8% — YT favored.
- weETH (60d): realized 4.8% versus implied 7.1% — PT favored.

These are point-in-time snapshots. Cross-check at execution time.

## 4. Strategy notes

- Long PT: locks in fixed yield. Beats holding underlying when realized
  yield drops below implied.
- Long YT: equivalent to leveraged yield exposure. Pays off if realized
  yield holds above implied through maturity.
- LP: paid by AMM fees plus PENDLE incentives; impermanent loss is one-
  sided because PT moves toward par as maturity approaches.

## 5. Operational notes

- Pendle V3 pools on Ethereum are non-upgradeable per-maturity contracts.
  No proxy upgrade risk; rollover is manual at maturity.
- Arbitrum deployments use the same contract code with chain-specific
  oracles. Maturities older than 365 days have not been deployed yet.
- Pendle's frontend caches APY for 60 seconds; for trading decisions
  query the on-chain oracle directly.

## 6. Risks

- Underlying depeg propagates to PT before maturity (PT trades below par).
- Yield collapse hurts YT linearly to days remaining.
- LP holders absorb depeg through the AMM; the LP token cannot exit until
  liquidity returns.
- Bridging risk on Arbitrum pools: assets routed via the canonical bridge
  have a 7-day finality lag on withdrawal.
