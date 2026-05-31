# EU TFR and EBA Travel Rule Guidelines Recipe

Listing id: att_reg_eu_tfr_eba_guidelines
Domain: regulatory_comparison
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for eu_crypto_transfer in the regulatory_comparison
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Label the EU source as `Regulation (EU) 2023/1113` plus EBA Travel Rule Guidelines.
- Track CASP and intermediary CASP duties separately from PSP duties.
- Use `Article 14` for information accompanying transfers of crypto-assets.
- Record checks for missing or incomplete information.
- Do not import the US `$3,000` threshold into EU crypto-transfer analysis.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
