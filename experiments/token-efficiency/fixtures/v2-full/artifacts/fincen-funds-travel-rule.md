# FinCEN Funds Travel Rule Q&A Extract

Listing id: att_reg_fincen_funds_travel_rule
Domain: regulatory_comparison
Kind: curated_dataset

## Use When

Use this artifact when the query asks for us_travel_rule in the regulatory_comparison
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Record the FinCEN Funds Travel Rule threshold as equal to or greater than `$3,000` or foreign equivalent.
- Preserve the distinction between recordkeeping and transmittal obligations.
- Label the source as FinCEN Q&A guidance for funds transfers.
- Add a caveat that crypto-specific applicability needs additional virtual currency guidance.
- Avoid claiming a blanket exemption for self-hosted wallets from this source alone.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
