# SKILL: Set Solana Priority Fee Dynamically

Use when sending a Solana transaction that must clear a congested slot.
Source evidence: see linked raw bundle.

## Three compute-budget instructions

- `SetComputeUnitLimit(units)` — pad actual usage by 10 to 20%.
- `SetComputeUnitPrice(microlamports_per_cu)` — the priority fee knob.
- `RequestHeapFrame(bytes)` — only if program uses more than 32 KB heap.

Fee:

```
fee_lamports = signatures_fee + (cu_price_microlamports * cu_used) / 1e6
```

## SIMD-0123 base fee

Base fee adjusts per slot toward `target_cu_per_slot = 48_000_000` with
factor `1/8`. Base fee is burned; declared price above base is paid to
validators.

## Estimation procedure

1. `getRecentPrioritizationFees` on the writable accounts.
2. p75 of non-zero entries (zeros = missing, not zero).
3. Multiply by 1.2.
4. Floor at 1,000 micro-lamports/CU when targeting high-throughput leaders.

## Jito

Tips routed via `tip_account` instruction. Default to p75 of last 100 slots
from `https://kobe.mainnet.jito.network/api/v1/bundles/tip_floor`. If the
bundle is not included, the tip is still consumed.

## Pitfalls

- Setting CU limit to exact usage causes rejection from preflight overhead.
- Same tx via both RPC and Jito can double-include; enforce idempotency
  in-program.
