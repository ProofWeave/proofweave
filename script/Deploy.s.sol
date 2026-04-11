₩// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

/// @title Deploy — ProofWeave AttestationRegistry 배포 스크립트
/// @notice Usage:
///   로컬:  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   실제:  forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external {
        // ── .env에서 환경 변수 읽기 ──────────────────────────
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        // ── 배포 시작 ─────────────────────────────────────────
        vm.startBroadcast(deployerKey);

        // 1. Implementation 배포 (로직 컨트랙트)
        AttestationRegistry implementation = new AttestationRegistry();

        // 2. Proxy 배포 + initialize 호출
        bytes memory initData = abi.encodeCall(
            AttestationRegistry.initialize,
            (owner, operator)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );

        vm.stopBroadcast();

        // ── 결과 출력 ─────────────────────────────────────────
        console.log("=== ProofWeave Deployment ===");
        console.log("Implementation:", address(implementation));
        console.log("Proxy (use this):", address(proxy));
        console.log("Owner:", owner);
        console.log("Operator:", operator);
    }
}
