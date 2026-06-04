# Raw Source Bundle: OpenZeppelin UUPS Deployment Checklist

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: security_deployment
Problem type: deployment_checklist
Listing id: att_sec_openzeppelin_uups_deploy
Last refreshed for fixture: 2026-04-29T00:00:00Z

## Source URLs

- https://docs.openzeppelin.com/upgrades-plugins
- https://docs.openzeppelin.com/upgrades-plugins/api-hardhat-upgrades
- https://docs.openzeppelin.com/contracts/5.x/api/proxy

## Extraction Notes

1. Upgradeable contracts must lock implementation initializers to prevent direct takeover.
2. UUPS upgrades rely on implementation-side authorization and ERC-1967 proxy storage slots.
3. Storage layout compatibility checks must run before upgrade transactions are proposed.
4. Deployment evidence should include implementation address, proxy address, initializer calldata, and verification artifacts.
5. Admin role ownership and upgrade authority should be recorded separately from deployer EOA.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | security_deployment | Upgradeable contracts must lock implementation initializers to prevent direct takeover. | keep |
| S2 | security_deployment | UUPS upgrades rely on implementation-side authorization and ERC-1967 proxy storage slots. | keep |
| S3 | security_deployment | Storage layout compatibility checks must run before upgrade transactions are proposed. | keep |
| S4 | security_deployment | Deployment evidence should include implementation address, proxy address, initializer calldata, and verification artifacts. | keep |
| S5 | security_deployment | Admin role ownership and upgrade authority should be recorded separately from deployer EOA. | keep |
