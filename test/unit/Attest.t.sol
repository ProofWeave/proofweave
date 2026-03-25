// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../helpers/TestSetup.sol";

contract AttestTest is TestSetup {
    // ============================================================
    //                    attest() — success
    // ============================================================

    function test_attest_success() public {
        vm.prank(operator);
        bytes32 id = registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);

        assertTrue(id != bytes32(0), "attestationId should not be zero");
        assertEq(registry.getAttestationCount(creator), 1);
    }

    function test_attest_emitsAttestedEvent() public {
        bytes32 expectedId = keccak256(abi.encodePacked(SAMPLE_HASH, creator, block.timestamp));

        vm.expectEmit(true, true, true, true);
        emit AttestationRegistry.Attested(expectedId, SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF, block.timestamp);

        vm.prank(operator);
        registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);
    }

    function test_attest_storesCorrectData() public {
        bytes32 id = _attestDefault();

        AttestationRegistry.Attestation memory att = registry.getAttestation(id);
        assertEq(att.contentHash, SAMPLE_HASH);
        assertEq(att.creator, creator);
        assertEq(keccak256(bytes(att.aiModel)), keccak256(bytes(SAMPLE_MODEL)));
        assertEq(att.timestamp, block.timestamp);
        assertEq(keccak256(bytes(att.offchainRef)), keccak256(bytes(SAMPLE_REF)));
    }

    function test_attest_differentCreatorSameHash() public {
        // creator 1
        _attestDefault();

        // creator 2 — same hash, different creator → should succeed
        vm.prank(operator);
        bytes32 id2 = registry.attest(SAMPLE_HASH, user1, SAMPLE_MODEL, SAMPLE_REF);

        assertTrue(id2 != bytes32(0));
        assertEq(registry.getAttestationCount(user1), 1);
    }

    // ============================================================
    //                    attest() — reverts
    // ============================================================

    function test_attest_revert_unauthorized() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.Unauthorized.selector));
        vm.prank(attacker);
        registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);
    }

    function test_attest_revert_alreadyAttested() public {
        _attestDefault();

        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.AlreadyAttested.selector, SAMPLE_HASH, creator));
        vm.prank(operator);
        registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);
    }

    function test_attest_revert_emptyContentHash() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.EmptyContentHash.selector));
        vm.prank(operator);
        registry.attest(bytes32(0), creator, SAMPLE_MODEL, SAMPLE_REF);
    }

    function test_attest_revert_zeroCreator() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.ZeroAddress.selector));
        vm.prank(operator);
        registry.attest(SAMPLE_HASH, address(0), SAMPLE_MODEL, SAMPLE_REF);
    }

    function test_attest_revert_emptyAiModel() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.EmptyAiModel.selector));
        vm.prank(operator);
        registry.attest(SAMPLE_HASH, creator, "", SAMPLE_REF);
    }

    function test_attest_revert_emptyOffchainRef() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.EmptyOffchainRef.selector));
        vm.prank(operator);
        registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, "");
    }
}
