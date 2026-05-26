# Solana Priority Fee Dynamic Pricing Notes (raw 2026-05-05)

> Raw evidence pack. Aggregates Solana docs on `ComputeBudget`, Jito tipping
> guidance, the dynamic priority-fee algorithm published by the Solana
> Foundation in SIMD-0123 (accepted 2026-02), and observed mainnet fee
> distributions collected by an internal indexer between 2026-04-01 and
> 2026-05-05.

## 1. Compute budget instructions

A modern transaction sets three compute budget instructions before the
business logic:

- `ComputeBudget::SetComputeUnitLimit(units)` — declares the maximum CUs
  used. Default if omitted is 200,000 CU.
- `ComputeBudget::SetComputeUnitPrice(microlamports_per_cu)` — declares the
  price per CU.
- `ComputeBudget::RequestHeapFrame(bytes)` — optional, only needed for
  programs using >32 KB heap.

Total fee paid:

```
fee_lamports = signatures_fee
             + (compute_unit_price_microlamports * cu_used) / 1_000_000
```

`cu_used` is the actual usage, capped by the declared limit. Setting the
limit too high pays for nothing (the unused CUs are not charged) but does
reduce parallelism by reserving the slot's CU budget.

## 2. SIMD-0123 dynamic algorithm

SIMD-0123 introduced an EIP-1559-like algorithm. Per-slot:

```
target_cu_per_slot     = 48_000_000
prev_block_cu_used     = sum of CUs in prior block
adjustment_factor      = 1 / 8
new_base_fee_per_cu    = prev_base_fee_per_cu *
    (1 + adjustment_factor * (prev_block_cu_used - target_cu_per_slot) /
     target_cu_per_slot)
```

The base fee is burned. Tips paid through `ComputeBudget::SetComputeUnit
Price` above the base fee are paid to validators. Jito-bundle tips remain
out-of-band and route through Jito's relayer.

## 3. Estimating priority fee

The recommended client-side estimation:

1. Call `getRecentPrioritizationFees` with the writable accounts of the
   tx. Returns up to 150 recent slots.
2. Take the 75th percentile of the non-zero entries.
3. Multiply by 1.2 to bias above the median.
4. Floor it to a minimum of 1,000 micro-lamports per CU when targeting a
   high-throughput leader.

For Jito bundle inclusion, set the tip via the dedicated
`tip_account` instruction:

- Mainnet tip accounts are listed in
  `https://kobe.mainnet.jito.network/api/v1/bundles/tip_floor`.
- Minimum economic tip varies by leader; the 75th percentile in the last
  100 slots is a sane default.

## 4. Observed mainnet distributions (2026-04 to 2026-05)

| Percentile | priority fee (micro-lamports / CU) | base fee (per CU) | Jito tip (lamports) |
|---|---|---|---|
| p50 | 1,200 | 950 | 7,500 |
| p75 | 5,400 | 1,800 | 22,000 |
| p90 | 17,800 | 4,300 | 68,000 |
| p99 | 230,000 | 18,400 | 410,000 |

Distributions are heavy-tailed; p99 events cluster around new spot ETF
listings and high-volume token launches.

## 5. Anti-pitfalls

- Setting `compute_unit_limit` to the program's CU usage exactly causes
  rejections when the runtime adds preflight overhead. Pad by 10 to 20%.
- The Solana RPC `getRecentPrioritizationFees` returns 0 for slots where
  the writable account had no traffic; treat zeros as missing, not as 0.
- Jito tips never pay validators; if the bundle is not included by the
  Jito relayer, the tip is still consumed by the tip account. Always check
  bundle inclusion via the bundle status endpoint.
- Sending the same tx through both regular RPC and Jito relayer can result
  in double inclusion if the Jito bundle lands later; idempotency must be
  ensured at the program level.

## 6. Working snippet

```ts
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction
} from "@solana/web3.js";

async function priorityFee(conn: Connection, writable: PublicKey[]) {
  const samples = await conn.getRecentPrioritizationFees({
    lockedWritableAccounts: writable
  });
  const nonzero = samples
    .map(s => s.prioritizationFee)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  if (nonzero.length === 0) return 1_000;
  const p75 = nonzero[Math.floor(nonzero.length * 0.75)] ?? 1_000;
  return Math.max(1_000, Math.floor(p75 * 1.2));
}

const tx = new Transaction()
  .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 220_000 }))
  .add(ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: await priorityFee(conn, writable)
  }));
```
