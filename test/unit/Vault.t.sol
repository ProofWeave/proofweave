// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../helpers/TestSetup.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract VaultTest is TestSetup {
    MockUSDC internal usdc;

    uint256 internal constant PRICE = 1_500_000;
    bytes32 internal constant RECEIPT_REF = keccak256("receipt-1");

    function setUp() public override {
        super.setUp();

        usdc = new MockUSDC();
        vm.prank(owner);
        registry.initializeVault(address(usdc));
    }

    function test_depositForAttestation_creditsCreator() public {
        bytes32 attestationId = _attestDefault();

        _fundAndApprove(user1, PRICE);

        vm.prank(user1);
        registry.depositForAttestation(attestationId, creator, PRICE, RECEIPT_REF);

        assertEq(registry.claimableBalance(creator), PRICE);
        assertTrue(registry.isReceiptCredited(RECEIPT_REF));
        assertEq(usdc.balanceOf(address(registry)), PRICE);
    }

    function test_depositForAttestation_revert_duplicateReceiptRef() public {
        bytes32 attestationId = _attestDefault();
        _deposit(attestationId, creator, PRICE, RECEIPT_REF, user1);

        _fundAndApprove(user2, PRICE);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.ReceiptAlreadyCredited.selector, RECEIPT_REF));
        vm.prank(user2);
        registry.depositForAttestation(attestationId, creator, PRICE, RECEIPT_REF);
    }

    function test_claimCreatorBalance_creatorCanClaim() public {
        bytes32 attestationId = _attestDefault();
        _deposit(attestationId, creator, PRICE, RECEIPT_REF, user1);

        vm.prank(creator);
        registry.claimCreatorBalance(PRICE, creator);

        assertEq(registry.claimableBalance(creator), 0);
        assertEq(usdc.balanceOf(creator), PRICE);
    }

    function test_claimCreatorBalance_revert_nonCreatorCannotSteal() public {
        bytes32 attestationId = _attestDefault();
        _deposit(attestationId, creator, PRICE, RECEIPT_REF, user1);

        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.InsufficientClaimable.selector, attacker, 0, PRICE));
        vm.prank(attacker);
        registry.claimCreatorBalance(PRICE, attacker);

        assertEq(registry.claimableBalance(creator), PRICE);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_existingAttestVerify_stillWorksWithVaultInitialized() public {
        bytes32 attestationId = _attestDefault();

        AttestationRegistry.Attestation memory stored = registry.getAttestation(attestationId);
        AttestationRegistry.Attestation memory verified = registry.verify(SAMPLE_HASH, creator);

        assertEq(stored.contentHash, SAMPLE_HASH);
        assertEq(verified.creator, creator);
        assertEq(registry.getAttestationCount(creator), 1);
    }

    function _deposit(bytes32 attestationId, address attestationCreator, uint256 amount, bytes32 receiptRef, address payer)
        internal
    {
        _fundAndApprove(payer, amount);

        vm.prank(payer);
        registry.depositForAttestation(attestationId, attestationCreator, amount, receiptRef);
    }

    function _fundAndApprove(address payer, uint256 amount) internal {
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(registry), amount);
    }
}
