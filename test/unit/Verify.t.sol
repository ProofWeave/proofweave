// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../helpers/TestSetup.sol";

contract VerifyTest is TestSetup {
    // ============================================================
    //                    verify()
    // ============================================================

    function test_verify_success() public {
        _attestDefault();

        AttestationRegistry.Attestation memory att = registry.verify(SAMPLE_HASH, creator);

        assertEq(att.contentHash, SAMPLE_HASH);
        assertEq(att.creator, creator);
    }

    function test_verify_revert_notFound() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.AttestationNotFound.selector));
        registry.verify(SAMPLE_HASH, creator);
    }

    function test_verify_revert_wrongCreator() public {
        // attest as creator
        _attestDefault();

        // verify with different creator → should fail
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.AttestationNotFound.selector));
        registry.verify(SAMPLE_HASH, user1);
    }

    // ============================================================
    //                    getAttestation()
    // ============================================================

    function test_getAttestation_success() public {
        bytes32 id = _attestDefault();

        AttestationRegistry.Attestation memory att = registry.getAttestation(id);
        assertEq(att.contentHash, SAMPLE_HASH);
    }

    function test_getAttestation_revert_notFound() public {
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.AttestationNotFound.selector));
        registry.getAttestation(bytes32(uint256(999)));
    }

    // ============================================================
    //                    getAttestationCount() / getCreatorAttestations()
    // ============================================================

    function test_getAttestationCount_zero() public view {
        assertEq(registry.getAttestationCount(creator), 0);
    }

    function test_getAttestationCount_afterMultiple() public {
        _attestWith(keccak256("a"), creator, SAMPLE_MODEL, SAMPLE_REF);
        _attestWith(keccak256("b"), creator, SAMPLE_MODEL, SAMPLE_REF);
        _attestWith(keccak256("c"), creator, SAMPLE_MODEL, SAMPLE_REF);

        assertEq(registry.getAttestationCount(creator), 3);
    }

    function test_getCreatorAttestations_returnsIds() public {
        bytes32 id1 = _attestWith(keccak256("a"), creator, SAMPLE_MODEL, SAMPLE_REF);
        bytes32 id2 = _attestWith(keccak256("b"), creator, SAMPLE_MODEL, SAMPLE_REF);

        bytes32[] memory ids = registry.getCreatorAttestations(creator);
        assertEq(ids.length, 2);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
    }
}
