// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../helpers/TestSetup.sol";

contract AccessControlTest is TestSetup {
    // ============================================================
    //                    setOperator()
    // ============================================================

    function test_setOperator_success() public {
        address newOp = makeAddr("newOperator");

        vm.expectEmit(true, true, false, false);
        emit AttestationRegistry.OperatorUpdated(operator, newOp);

        vm.prank(owner);
        registry.setOperator(newOp);

        assertEq(registry.operator(), newOp);
    }

    function test_setOperator_revert_notOwner() public {
        vm.expectRevert();
        vm.prank(attacker);
        registry.setOperator(makeAddr("newOp"));
    }

    function test_setOperator_revert_zeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.ZeroAddress.selector));
        vm.prank(owner);
        registry.setOperator(address(0));
    }

    function test_setOperator_newOperatorCanAttest() public {
        address newOp = makeAddr("newOperator");
        vm.prank(owner);
        registry.setOperator(newOp);

        // old operator should fail
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.Unauthorized.selector));
        vm.prank(operator);
        registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);

        // new operator should succeed
        vm.prank(newOp);
        bytes32 id = registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);
        assertTrue(id != bytes32(0));
    }

    // ============================================================
    //                    renounceOwnership()
    // ============================================================

    function test_renounceOwnership_revert() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.Unauthorized.selector));
        vm.prank(owner);
        registry.renounceOwnership();
    }

    // ============================================================
    //                    initialize() access
    // ============================================================

    function test_initialize_revert_doubleInit() public {
        vm.expectRevert();
        registry.initialize(owner, operator);
    }
}
