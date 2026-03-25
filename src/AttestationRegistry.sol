// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title AttestationRegistry
 * @notice AI 에이전트가 생성한 데이터의 출처를 온체인에 기록하고,
 *         다른 에이전트가 검증 후 결제하여 사용할 수 있는 프로토콜
 *
 * @dev UUPS Proxy 패턴. Storage 변수 순서 변경 금지.
 *      - operator: API 서버 지갑 (attest 전용)
 *      - owner: 프로젝트 관리자 (upgrade, operator 변경)
 */
contract AttestationRegistry is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // ============================================================
    //                         STRUCTS
    // ============================================================

    struct Attestation {
        bytes32 contentHash; // SHA-256 of canonical JSON
        address creator; // 원본 생성자 (API가 전달, msg.sender 아님)
        string aiModel; // "gpt-4o", "claude-3.5" 등
        uint256 timestamp; // block.timestamp
        string offchainRef; // IPFS CID
    }

    // ============================================================
    //                         STORAGE
    // ============================================================
    // ⚠️ 순서 변경 금지 (UUPS 프록시 제약)

    /// @notice attestationId → Attestation 데이터
    mapping(bytes32 => Attestation) private _attestations;

    /// @notice keccak256(contentHash + creator) → attestationId (중복 방지 + verify용)
    mapping(bytes32 => bytes32) private _attestationByKey;

    /// @notice creator → attestationId[] (온체인 검증용, 일반 조회는 API 이벤트 인덱싱)
    mapping(address => bytes32[]) private _creatorAttestations;

    /// @notice API 서버 지갑 주소 (attest 전용)
    address public operator;

    // ============================================================
    //                         EVENTS
    // ============================================================

    event Attested(
        bytes32 indexed attestationId,
        bytes32 indexed contentHash,
        address indexed creator,
        string aiModel,
        string offchainRef,
        uint256 timestamp
    );

    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);

    // ============================================================
    //                         ERRORS
    // ============================================================

    error AlreadyAttested(bytes32 contentHash, address creator);
    error AttestationNotFound();
    error EmptyContentHash();
    error EmptyAiModel();
    error EmptyOffchainRef();
    error Unauthorized();
    error ZeroAddress();

    // ============================================================
    //                        MODIFIERS
    // ============================================================

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    // ============================================================
    //                      INITIALIZER
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice 프록시 초기화용 (배포 시 1회)
    /// @param initialOwner 프로젝트 관리자 주소
    /// @param initialOperator API 서버 지갑 주소
    // 초기화 로직 + modifier 적용
    function initialize(address initialOwner, address initialOperator) public initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (initialOperator == address(0)) revert ZeroAddress();

        __Ownable_init(initialOwner);

        operator = initialOperator;
    }

    // ============================================================
    //                    UPGRADE AUTHORIZATION
    // ============================================================

    /// @dev owner만 업그레이드 가능
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============================================================
    //                    OPERATOR MANAGEMENT
    // ============================================================

    /// @notice operator 변경 (owner만)
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address oldOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(oldOperator, newOperator);
    }

    /// @dev owner를 소유권 포기 삭제 / 향후 권한 MPC로 분류해서 운영해볼까 고려중..
    function renounceOwnership() public pure override {
        revert Unauthorized();
    }

    /// @notice AI 데이터 출처 등록 (API 서버만 호출 가능)
    /// @param contentHash SHA-256 of canonical JSON
    /// @param creator 원본 생성자 주소 (API가 전달)
    /// @param aiModel AI 모델 이름
    /// @param offchainRef IPFS CID
    /// @return attestationId 생성된 attestation ID
    function attest(bytes32 contentHash, address creator, string calldata aiModel, string calldata offchainRef)
        external
        onlyOperator
        returns (bytes32 attestationId)
    {
        // 1. 입력 검증 (가장 자주 실패할 것부터 → 빠른 revert)
        if (contentHash == bytes32(0)) revert EmptyContentHash();
        if (creator == address(0)) revert ZeroAddress();
        if (bytes(aiModel).length == 0) revert EmptyAiModel();
        if (bytes(offchainRef).length == 0) revert EmptyOffchainRef();

        // 2. 중복 체크: keccak256(contentHash + creator)
        bytes32 registrationKey = keccak256(abi.encodePacked(contentHash, creator));
        if (_attestationByKey[registrationKey] != bytes32(0)) {
            revert AlreadyAttested(contentHash, creator);
        }

        // 3. attestationId 생성: keccak256(contentHash + creator + timestamp)
        attestationId = keccak256(abi.encodePacked(contentHash, creator, block.timestamp));

        // 4. Storage 기록 (SSTORE 3회)
        _attestations[attestationId] = Attestation({
            contentHash: contentHash, // 콘텐츠 원본 보장
            creator: creator, // 제작자
            aiModel: aiModel, // ai 모델
            timestamp: block.timestamp, // 생성 시간
            offchainRef: offchainRef // 오프체인 데이터 참조
        });
        _attestationByKey[registrationKey] = attestationId; // 중복 방지 + verify용
        _creatorAttestations[creator].push(attestationId); // 온체인 검증용

        // 5. 이벤트
        emit Attested(attestationId, contentHash, creator, aiModel, offchainRef, block.timestamp);
    }

    // ============================================================
    //                    QUERY (Phase 1-2)
    // ============================================================

    /// @notice contentHash + creator로 attestation 조회
    function verify(bytes32 contentHash, address creator) external view returns (Attestation memory) {
        bytes32 registrationKey = keccak256(abi.encodePacked(contentHash, creator));
        bytes32 attestationId = _attestationByKey[registrationKey];
        if (attestationId == bytes32(0)) revert AttestationNotFound();
        return _attestations[attestationId];
    }

    /// @notice attestationId로 attestation 조회
    function getAttestation(bytes32 attestationId) external view returns (Attestation memory) {
        Attestation memory att = _attestations[attestationId];
        if (att.creator == address(0)) revert AttestationNotFound();
        return att;
    }

    /// @notice creator가 등록한 attestation 수
    function getAttestationCount(address creator) external view returns (uint256) {
        return _creatorAttestations[creator].length;
    }

    /// @notice creator가 등록한 attestationId 목록
    function getCreatorAttestations(address creator) external view returns (bytes32[] memory) {
        return _creatorAttestations[creator];
    }

    // ============================================================
    //                    PAYMENT (Phase 1-3)
    // ============================================================

    // TODO: Phase 1-3에서 구현 — deposit(), withdraw(), setPaymentPolicy(), payFrom(), hasPaid()
}
