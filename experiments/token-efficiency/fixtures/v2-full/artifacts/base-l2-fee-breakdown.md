# Base L2 Fee Breakdown Recipe

Listing id: att_fee_base_l2_breakdown
Domain: onchain_fee_measurement
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for l2_fee_breakdown in the onchain_fee_measurement
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Break Base transaction cost into L2 execution fee and L1 data fee when fields are available.
- Store transaction receipt, chain id, gas used, effective gas price, and calldata size.
- Mark OP Stack fee fields as measured evidence rather than generic Ethereum L1 estimates.
- Compare fee samples only over the same chain and time window.
- Do not merge L1 data fee into priority fee without naming the transformation.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
