# RECIPE: Base Mainnet UUPS Proxy Deployment

Use when shipping a new UUPS upgradeable contract to Base mainnet. Source
evidence: see linked raw bundle.

## Versions

- `forge` 0.2.0+commit.b9b00b3a or newer
- `openzeppelin-contracts-upgradeable` v5.4.0
- `openzeppelin-contracts` v5.4.0 (must match upgradeable minor)
- `foundry.toml`: optimizer on, runs 200, evm_version `cancun`

## Storage

- Inheritance order: `Initializable`, `UUPSUpgradeable`, then access mixins.
- Reserve `uint256[50] __gap` at the tail of every base contract.
- Diff `forge inspect <name> storageLayout` against `script/storage/` snapshot
  before tagging.

## Initializer

- Implementation constructor calls `_disableInitializers()`.
- `initialize(...)` is `external initializer` and sets all roles.
- For V2 of an existing V1, do not call `__UUPSUpgradeable_init()` inside
  `reinitialize(uint64)`.

## Authorization

- `_authorizeUpgrade` guarded by `onlyRole(UPGRADER_ROLE)` or `onlyOwner`.
- Both `UPGRADER_ROLE` and `DEFAULT_ADMIN_ROLE` held by a Safe multisig,
  never an EOA. Multisig signers controlled by a timelock.

## Deploy

```bash
forge script script/DeployAttestationRegistry.s.sol \
  --rpc-url $BASE_RPC --broadcast --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  --slow --gas-estimate-multiplier 130
```

`--slow` is required to avoid nonce races during verification.

## Verify

- Verify implementation, not the proxy.
- Mark proxy via Sourcify (`etherscan.verifyProxyContract`); Basescan does
  not auto-detect ERC1967 proxies under 10 KB.
- Hash check: `cast code <impl> | sha256sum` matches audit hash in
  `audits/`.

## Hand-off

- Grant `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to multisig, then renounce
  from deployer EOA in one Safe batch.
- Burn deployer EOA: move all funds, never reuse the private key.
- Index: record `(implAddr, proxyAddr, gitSha, auditHash)` on-chain and
  submit to Routescan.
