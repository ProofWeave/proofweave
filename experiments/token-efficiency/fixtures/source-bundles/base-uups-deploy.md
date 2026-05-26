# Base Mainnet UUPS Proxy Deployment Checklist (raw notes 2026-04-30)

> Raw evidence pack. Combines OpenZeppelin upgradeable plugin docs as of
> 2026-04, the Base mainnet deployment runbook from internal infra, the
> last three audited deployments of the AttestationRegistry contract, and
> the Etherscan verification notes for those deployments.

## 1. Pre-deployment

- Foundry version pinned: `forge 0.2.0+commit.b9b00b3a` or newer.
- `lib/openzeppelin-contracts-upgradeable` at tag `v5.4.0`.
- `lib/openzeppelin-contracts` at tag `v5.4.0` (must match the upgradeable
  variant minor; mismatching minors breaks `Initializable` storage layout).
- `foundry.toml` has `optimizer = true`, `optimizer_runs = 200`, evm_version
  `cancun`. Base mainnet supports Cancun as of 2026-04 hard fork.

## 2. Storage layout safety

- All upgradeable contracts inherit `Initializable` first, then
  `UUPSUpgradeable`, then any access control mixin.
- Storage gap pattern: every base contract reserves `uint256[50] __gap` at
  the tail. Mandatory for V1; can be reduced in later versions but never
  increased.
- Never reorder state variables between versions. Adding fields is allowed
  only at the end of the layout and only if it consumes from the gap.
- Run `forge inspect AttestationRegistry storageLayout` and diff against the
  prior version's snapshot under `script/storage/` before tagging a release.

## 3. Initializer rules

- Constructor must call `_disableInitializers()` to prevent implementation
  initialization.
- `initialize(...)` is `external initializer` and sets all owner/admin roles.
- `reinitialize(uint64 version)` is used for V2+ migrations and must call
  `__UUPSUpgradeable_init()` only if the parent's storage was not previously
  initialized. For V2 of an existing V1 deployment, skip the
  `__UUPSUpgradeable_init()` call.

## 4. Authorization

- `_authorizeUpgrade(address newImpl)` must be guarded by
  `onlyRole(UPGRADER_ROLE)` or `onlyOwner`. Never leave it empty.
- `UPGRADER_ROLE` is held by a Safe multisig on Base mainnet, never an EOA.
- `DEFAULT_ADMIN_ROLE` is also held by the multisig and the timelock owns
  the multisig signer set.

## 5. Deployment script

```solidity
// script/DeployAttestationRegistry.s.sol
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        AttestationRegistry impl = new AttestationRegistry();
        bytes memory init = abi.encodeCall(
            AttestationRegistry.initialize,
            (owner, treasury, baseFeeWei)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), init);
        vm.stopBroadcast();
        console2.log("proxy", address(proxy));
        console2.log("impl", address(impl));
    }
}
```

Run with:

```bash
forge script script/DeployAttestationRegistry.s.sol \
  --rpc-url $BASE_RPC --broadcast --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  --slow --gas-estimate-multiplier 130
```

The `--slow` flag is required on Base because parallel nonces during the
verification step have caused failed Etherscan submissions on three of the
last five deployments.

## 6. Verification

- Use `forge verify-contract` with the proxy's `impl` address, not the proxy.
- For the proxy itself, run `cast send` to call
  `etherscan.verifyProxyContract` via the Sourcify route. Basescan does not
  auto-detect ERC1967 proxies for contracts under 10 KB.
- Confirm the implementation's `_authorizeUpgrade` selector resolves to the
  same bytecode as the audited tag. Use
  `cast code <impl> | sha256sum` and compare against the audit deliverable
  hash recorded under `audits/`.

## 7. Post-deployment

- Transfer `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to the multisig with
  `grantRole` then `renounceRole` from the deployer EOA in the same tx
  batch via the Safe transaction builder.
- Lock the deployer EOA: move all funds, do not reuse. The EOA's private key
  is treated as burned after this step.
- Emit a `Deployment` event log to the on-chain registry index contract
  with `(implAddr, proxyAddr, gitSha, auditHash)`.
- Submit the verified proxy to `https://routescan.io/` for indexing.

## 8. Common gotchas

- Forgetting `_disableInitializers()` in the implementation constructor lets
  anyone call `initialize` on the implementation directly, which can be a
  prerequisite for a delegatecall-based takeover. Severity: high.
- Using `onlyOwner` on `_authorizeUpgrade` while transferring ownership to
  a contract that does not implement `Ownable` semantics bricks upgrades.
- Mixing `AccessControl` and `AccessControlEnumerable` between V1 and V2
  changes storage layout. Always pick one and stay.
- Running `forge script ... --broadcast` without `--slow` on Base produces
  intermittent `nonce too low` errors during verification.
