// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    using SafeERC20 for IERC20;

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

    /// @notice USDC token held by the creator-claim vault. Appended for UUPS storage safety.
    IERC20 public usdc;

    /// @notice creator → claimable USDC amount
    mapping(address => uint256) private _claimable;

    /// @notice replay-safe payment reference → credited flag
    mapping(bytes32 => bool) private _receiptCredited;

    /// @dev Manual reentrancy guard storage, appended after existing Phase 1 storage.
    uint256 private _vaultEntered;

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

    event VaultInitialized(address indexed usdcToken);
    event VaultDeposited(
        bytes32 indexed receiptRef,
        bytes32 indexed attestationId,
        address indexed creator,
        address payer,
        uint256 amount
    );
    event CreatorClaimed(address indexed creator, address indexed to, uint256 amount);

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
    error VaultNotInitialized();
    error ZeroAmount();
    error EmptyReceiptRef();
    error ReceiptAlreadyCredited(bytes32 receiptRef);
    error CreatorMismatch(address expected, address actual);
    error InsufficientClaimable(address creator, uint256 available, uint256 requested);
    error ReentrantCall();

    // ============================================================
    //                        MODIFIERS
    // ============================================================

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier nonReentrantVault() {
        if (_vaultEntered == 1) revert ReentrantCall();
        _vaultEntered = 1;
        _;
        _vaultEntered = 0;
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

    /// @notice Initializes vault settlement after upgrading an existing proxy to the vault-aware implementation.
    function initializeVault(address usdcToken) external onlyOwner reinitializer(2) {
        if (usdcToken == address(0)) revert ZeroAddress();
        usdc = IERC20(usdcToken);
        emit VaultInitialized(usdcToken);
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

    // ============================================================
    //                    CREATOR VAULT SETTLEMENT
    // ============================================================

    /// @notice Deposits USDC into the vault and credits the onchain attestation creator.
    /// @dev The backend passes creator from pricing_policies, which is only set after DB-level
    ///      attestation creator verification. This function also checks the onchain attestation
    ///      creator so a stale or tampered backend row cannot credit a different address.
    function depositForAttestation(bytes32 attestationId, address creator, uint256 amount, bytes32 receiptRef)
        external
        nonReentrantVault
    {
        IERC20 token = usdc;
        if (address(token) == address(0)) revert VaultNotInitialized();
        if (creator == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (receiptRef == bytes32(0)) revert EmptyReceiptRef();
        if (_receiptCredited[receiptRef]) revert ReceiptAlreadyCredited(receiptRef);

        Attestation storage att = _attestations[attestationId];
        if (att.creator == address(0)) revert AttestationNotFound();
        if (att.creator != creator) revert CreatorMismatch(att.creator, creator);

        _receiptCredited[receiptRef] = true;
        _claimable[creator] += amount;

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit VaultDeposited(receiptRef, attestationId, creator, msg.sender, amount);
    }

    /// @notice Claims USDC credited to msg.sender as an attestation creator.
    function claimCreatorBalance(uint256 amount, address to) external nonReentrantVault {
        IERC20 token = usdc;
        if (address(token) == address(0)) revert VaultNotInitialized();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 available = _claimable[msg.sender];
        if (amount > available) revert InsufficientClaimable(msg.sender, available, amount);

        _claimable[msg.sender] = available - amount;
        token.safeTransfer(to, amount);

        emit CreatorClaimed(msg.sender, to, amount);
    }

    function claimableBalance(address creator) external view returns (uint256) {
        return _claimable[creator];
    }

    function isReceiptCredited(bytes32 receiptRef) external view returns (bool) {
        return _receiptCredited[receiptRef];
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
    //                    DESIGN NOTE
    // ============================================================
    // x402 payment orchestration remains in the API, but paid smart-wallet access
    // now settles into this vault before the API issues an AccessReceipt.
}
