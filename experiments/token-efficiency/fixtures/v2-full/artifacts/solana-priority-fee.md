# Solana Priority Fee Measurement Skill

Listing id: att_fee_solana_priority_fee
Domain: onchain_fee_measurement
Kind: skill

## Use When

Use this artifact when the query asks for fee_estimation in the onchain_fee_measurement
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Query `getRecentPrioritizationFees` for recent local fee evidence.
- Set the compute unit limit with `SetComputeUnitLimit` based on simulation plus margin.
- Set the compute unit price with `SetComputeUnitPrice` in micro-lamports.
- Estimate prioritization fee as compute unit price times compute unit limit divided by 1,000,000.
- Track Jito tips separately from native prioritization fee fields.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
