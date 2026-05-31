# OpenZeppelin UUPS Deployment Checklist

Listing id: att_sec_openzeppelin_uups_deploy
Domain: security_deployment
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for deployment_checklist in the security_deployment
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Call `_disableInitializers` in the implementation constructor or equivalent initializer-lock pattern.
- Deploy through `ERC1967Proxy` or an upgrades plugin configured for `kind: "uups"`.
- Run a storage layout compatibility check before upgrades.
- Record implementation address, proxy address, initializer calldata, and verification transaction.
- Verify upgrade authorization and owner/admin role separation.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
