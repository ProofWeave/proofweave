# Slither Static Analysis Triage Recipe

Listing id: att_sec_slither_static_analysis
Domain: security_deployment
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for static_analysis in the security_deployment
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Run Slither and preserve detector id, severity, file, and line evidence.
- Export JSON or SARIF so CI can diff findings.
- Triage false positives with an explicit rationale.
- Define deployment blockers by detector severity and the project's threat model.
- Do not treat informational findings as automatic deploy blockers.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
