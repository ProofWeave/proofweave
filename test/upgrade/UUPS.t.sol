// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";

contract UUPSTest is Test {
    AttestationRegistry public implementation;
    AttestationRegistry public registry;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address attacker = makeAddr("attacker");

    function setUp() public {
        implementation = new AttestationRegistry();

        bytes memory initData = abi.encodeCall(AttestationRegistry.initialize, (owner, operator));
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        registry = AttestationRegistry(address(proxy));
    }

    // ============================================================
    //                    Proxy initialization
    // ============================================================

    function test_proxy_ownerStored() public view {
        assertEq(registry.owner(), owner);
    }

    function test_proxy_operatorStored() public view {
        assertEq(registry.operator(), operator);
    }

    function test_proxy_doubleInitialize_revert() public {
        vm.expectRevert();
        registry.initialize(attacker, attacker);
    }

    // ============================================================
    //                    Implementation direct call blocked
    // ============================================================

    function test_implementation_initializeBlocked() public {
        vm.expectRevert();
        implementation.initialize(attacker, attacker);
    }

    // ============================================================
    //                    Upgrade authorization
    // ============================================================

    function test_upgrade_nonOwner_revert() public {
        AttestationRegistry newImpl = new AttestationRegistry();

        vm.expectRevert();
        vm.prank(attacker);
        registry.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_owner_success() public {
        AttestationRegistry newImpl = new AttestationRegistry();

        vm.prank(owner);
        registry.upgradeToAndCall(address(newImpl), "");

        // State should persist after upgrade
        assertEq(registry.owner(), owner);
        assertEq(registry.operator(), operator);
    }

    function test_upgrade_preservesAttestationData() public {
        // 1. Attest before upgrade
        bytes32 contentHash = keccak256("upgrade test");
        address creator = makeAddr("creator");

        vm.prank(operator);
        bytes32 attestationId = registry.attest(contentHash, creator, "gpt-4o", "ipfs://QmUpgrade");

        // 2. Upgrade
        AttestationRegistry newImpl = new AttestationRegistry();
        vm.prank(owner);
        registry.upgradeToAndCall(address(newImpl), "");

        // 3. Verify data survives upgrade
        AttestationRegistry.Attestation memory att = registry.getAttestation(attestationId);
        assertEq(att.contentHash, contentHash);
        assertEq(att.creator, creator);
        assertEq(registry.getAttestationCount(creator), 1);

        // 4. Verify via contentHash + creator still works
        AttestationRegistry.Attestation memory att2 = registry.verify(contentHash, creator);
        assertEq(att2.contentHash, contentHash);
    }

    // ============================================================
    //                    Initialize with zero address
    // ============================================================

    function test_initialize_zeroOwner_revert() public {
        AttestationRegistry impl2 = new AttestationRegistry();

        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.ZeroAddress.selector));
        new ERC1967Proxy(address(impl2), abi.encodeCall(AttestationRegistry.initialize, (address(0), operator)));
    }

    function test_initialize_zeroOperator_revert() public {
        AttestationRegistry impl2 = new AttestationRegistry();

        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.ZeroAddress.selector));
        new ERC1967Proxy(address(impl2), abi.encodeCall(AttestationRegistry.initialize, (owner, address(0))));
    }
}
