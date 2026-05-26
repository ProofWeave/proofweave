// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

/// @title UpgradeVault — upgrades an existing UUPS proxy and initializes vault settlement
/// @notice Usage:
///   forge script script/UpgradeVault.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
contract UpgradeVault is Script {
    function run() external {
        uint256 upgraderKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_CONTRACT_ADDRESS");

        vm.startBroadcast(upgraderKey);

        AttestationRegistry implementation = new AttestationRegistry();
        bytes memory initVaultData = abi.encodeCall(AttestationRegistry.initializeVault, (usdcAddress));

        AttestationRegistry(proxyAddress).upgradeToAndCall(address(implementation), initVaultData);

        vm.stopBroadcast();

        console.log("=== ProofWeave Vault Upgrade ===");
        console.log("Proxy:", proxyAddress);
        console.log("Implementation:", address(implementation));
        console.log("USDC:", usdcAddress);
    }
}
