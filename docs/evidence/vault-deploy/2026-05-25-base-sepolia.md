# Vault Upgrade Evidence - Base Sepolia

Date: 2026-05-25
Network: Base Sepolia (`84532`)

## Addresses

- Proxy / registry: `0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E`
- Vault address: `0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E`
- Implementation: `0x11c86A6f5110727Bf9A8a19aE4F09C24141438C5`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Owner / upgrader: `0x0df5Ea611e4868A42D600Aa2F552f72d7612f53c`

## Broadcast evidence

Broadcast file:

```text
broadcast/UpgradeVault.s.sol/84532/run-latest.json
```

Sanitized committed summary:

```text
docs/evidence/vault-deploy/base-sepolia-upgrade-transactions.json
```

Transactions recorded there:

```text
Implementation create tx:
0xfa8abf4bccd6a9e563afb6579fd6ddd0087de1f11f1c7a5bed624f73efa8e07d

Proxy upgradeToAndCall tx:
0xe68dab4b4520e42e2a03461645ab70592852b883746bae58ddc7787c5b5a1a72
```

The proxy call used:

```text
upgradeToAndCall(
  0x11c86A6f5110727Bf9A8a19aE4F09C24141438C5,
  0xccb6a270000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e
)
```

The calldata selector `0xccb6a270` is `initializeVault(address)` encoded with Base Sepolia USDC.

## Onchain verification

Vault token:

```bash
cast call "0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E" \
  "usdc()(address)" \
  --rpc-url "https://sepolia.base.org"
```

Observed:

```text
0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

ERC-1967 implementation slot:

```bash
cast storage "0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E" \
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" \
  --rpc-url "https://sepolia.base.org"
```

Observed:

```text
0x00000000000000000000000011c86a6f5110727bf9a8a19ae4f09c24141438c5
```

Owner:

```bash
cast call "0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E" \
  "owner()(address)" \
  --rpc-url "https://sepolia.base.org"
```

Observed:

```text
0x0df5Ea611e4868A42D600Aa2F552f72d7612f53c
```

Claimable balance query:

```bash
cast call "0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E" \
  "claimableBalance(address)(uint256)" \
  "0x0df5Ea611e4868A42D600Aa2F552f72d7612f53c" \
  --rpc-url "https://sepolia.base.org"
```

Observed:

```text
0
```

## Follow-up evidence still needed

- Store the `initializeVault(address)` re-call revert transcript if it should be part of permanent evidence.
- Store a storage-layout comparison once Foundry emits storage layout metadata for the artifact.
- Store a successful CDP UserOperation tx and `VaultDeposited` event after the Phase 2 smoke test.
