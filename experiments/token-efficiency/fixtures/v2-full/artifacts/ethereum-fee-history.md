# Ethereum EIP-1559 Fee History Dataset

Listing id: att_fee_ethereum_fee_history
Domain: onchain_fee_measurement
Kind: curated_dataset

## Use When

Use this artifact when the query asks for fee_history in the onchain_fee_measurement
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Collect `eth_feeHistory` over a fixed block window and store the block range.
- Use `baseFeePerGas` for the base fee path and reward percentiles for priority-fee evidence.
- Report `maxPriorityFeePerGas` and `maxFeePerGas` separately.
- Normalize units to wei and display gwei only as a derived view.
- Flag sparse reward arrays instead of forward-filling missing priority fee evidence.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
