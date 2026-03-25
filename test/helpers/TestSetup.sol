// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";

/// @dev All Phase 1-2 tests inherit this. Deploys via ERC1967Proxy.
abstract contract TestSetup is Test {
    AttestationRegistry public registry;
    AttestationRegistry public implementation;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address creator = makeAddr("creator");
    address attacker = makeAddr("attacker");
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");

    bytes32 constant SAMPLE_HASH = keccak256("sample content");
    string constant SAMPLE_MODEL = "gpt-4o";
    string constant SAMPLE_REF = "ipfs://QmSampleCID"; // 저장된 데이터 주소

    function setUp() public virtual {
        // 1. Deploy implementation
        implementation = new AttestationRegistry();

        // 2. Deploy proxy + initialize
        bytes memory initData = abi.encodeCall(AttestationRegistry.initialize, (owner, operator)); // proxy 구조에서 바로 initialize 호출(owner/operator setting)
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData // initialize 함수 호출하기 위한 인코딩된 데이터
        );

        // 3. Cast proxy to registry interface
        registry = AttestationRegistry(address(proxy)); // registry interface로 캐스팅
    }

    /// @dev Helper: attest as operator with defaults
    // 다음 호출의 msg.sender를 operator로 설정
    function _attestDefault() internal returns (bytes32 attestationId) {
        vm.prank(operator);
        attestationId = registry.attest(SAMPLE_HASH, creator, SAMPLE_MODEL, SAMPLE_REF);
    }

    /// @dev Helper: attest with custom params
    // _attestDefault의 custom 확장
    function _attestWith(bytes32 contentHash, address _creator, string memory aiModel, string memory offchainRef)
        internal
        returns (bytes32 attestationId)
    {
        vm.prank(operator);
        attestationId = registry.attest(contentHash, _creator, aiModel, offchainRef);
    }
}
