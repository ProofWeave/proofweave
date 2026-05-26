# ProofWeave Evidence Index

This index links implementation claims to durable evidence files. Do not commit Foundry `cache/` files; they can contain sensitive values.

## Vault deployment

- Evidence: [vault-deploy/2026-05-25-base-sepolia.md](vault-deploy/2026-05-25-base-sepolia.md)
- Sanitized tx summary: [vault-deploy/base-sepolia-upgrade-transactions.json](vault-deploy/base-sepolia-upgrade-transactions.json)
- Local broadcast log, if present: `broadcast/UpgradeVault.s.sol/84532/run-latest.json`
- Network: Base Sepolia (`84532`)
- Proxy: `0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E`
- Implementation: `0x11c86A6f5110727Bf9A8a19aE4F09C24141438C5`
- Vault USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Token efficiency benchmark

- Latest local report: `experiments/token-efficiency/outputs/runs/20260525T173607Z/summary.md`
- Mode: offline canonical text token count, not provider billing usage
- Token method: `tiktoken_o200k_base`
- Matched queries: `6 / 6`
- Pooled CTT reduction: `65.04%`
- Quality proxy pass: `6 / 6`

Do not quote this as provider-side billing reduction. The report explicitly labels it as Phase 1 offline canonical token counting.

## CLI harness

- Build command: `npm --prefix cli run build`
- Help check: `node cli/dist/index.js --help`
- Doctor failure-mode smoke: `HOME=/var/folders/zm/_3t78dcd67zbw_86kznpp7s80000gn/T/opencode/proofweave-doctor-empty node cli/dist/index.js doctor || true`
