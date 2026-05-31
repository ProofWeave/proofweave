# FATF Travel Rule Baseline Comparison

Listing id: att_reg_fatf_travel_rule
Domain: regulatory_comparison
Kind: curated_dataset

## Use When

Use this artifact when the query asks for travel_rule in the regulatory_comparison
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Use FATF Recommendation 16 as the baseline, not as a substitute for local law.
- Track required originator information and beneficiary information separately.
- Identify whether the counterparty is a VASP, other obliged entity, or self-hosted wallet.
- Mark jurisdiction-specific thresholds as local implementation fields.
- Flag self-hosted wallet treatment as requiring local-law verification.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
