// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry public registry;

    function setUp() public {
        registry = new AttestationRegistry();
    }

    function test_deploy() public view {
        // 배포 성공 확인
        assertTrue(address(registry) != address(0));
    }
}
