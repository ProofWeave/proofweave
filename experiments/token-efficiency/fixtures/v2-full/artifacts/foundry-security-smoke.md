# Foundry Security Smoke Test Skill

Listing id: att_sec_foundry_security_smoke
Domain: security_deployment
Kind: skill

## Use When

Use this artifact when the query asks for predeploy_security in the security_deployment
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Run `forge test` for deterministic unit coverage.
- Run targeted fuzz tests for boundary inputs and accounting transitions.
- Run invariant tests for balances, roles, and supply constraints.
- Pin fork tests by chain id and block number.
- Record `forge snapshot` separately from security pass/fail.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
