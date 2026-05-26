import { decodeFunctionData } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Hex = `0x${string}`;

const SMART_WALLET = "0x1111111111111111111111111111111111111111" as Hex;
const EOA = "0x2222222222222222222222222222222222222222" as Hex;
const PAYER = "0x3333333333333333333333333333333333333333" as Hex;
const CREATOR = "0x4444444444444444444444444444444444444444" as Hex;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex;
const VAULT = "0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E" as Hex;
const ATTESTATION_ID = `0x${"a".repeat(64)}` as Hex;
const RECEIPT_REF = `0x${"b".repeat(64)}` as Hex;
const TX_HASH = `0x${"c".repeat(64)}` as Hex;

const mockQuery = vi.hoisted(() => vi.fn());
const mockGetAccount = vi.hoisted(() => vi.fn());
const mockGetSmartAccount = vi.hoisted(() => vi.fn());
const mockSendUserOperation = vi.hoisted(() => vi.fn());
const mockWaitForUserOperation = vi.hoisted(() => vi.fn());

vi.mock("../services/db.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    CDP_API_KEY_ID: "test-cdp-key",
    USDC_CONTRACT_ADDRESS: USDC,
    VAULT_ADDRESS: VAULT,
  },
}));

vi.mock("../config/cdp.js", () => ({
  getCdpClient: () => ({
    evm: {
      getAccount: mockGetAccount,
      getSmartAccount: mockGetSmartAccount,
      sendUserOperation: mockSendUserOperation,
      waitForUserOperation: mockWaitForUserOperation,
    },
  }),
}));

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const vaultAbi = [
  {
    type: "function",
    name: "depositForAttestation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestationId", type: "bytes32" },
      { name: "creator", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "receiptRef", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

describe("wallet vault deposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [
        {
          eoa_address: EOA,
          wallet_address: PAYER,
          smart_wallet_address: SMART_WALLET,
        },
      ],
    });
    mockGetAccount.mockResolvedValue({ address: EOA });
    mockGetSmartAccount.mockResolvedValue({ address: SMART_WALLET });
    mockSendUserOperation.mockResolvedValue({
      userOpHash: `0x${"d".repeat(64)}`,
      smartAccountAddress: SMART_WALLET,
    });
    mockWaitForUserOperation.mockResolvedValue({
      status: "complete",
      transactionHash: TX_HASH,
    });
  });

  it("submits approve then vault deposit in one UserOperation", async () => {
    const { depositUsdcToVaultFromSmartWallet } = await import("../services/wallet.js");

    const txHash = await depositUsdcToVaultFromSmartWallet(
      SMART_WALLET,
      ATTESTATION_ID,
      CREATOR,
      1_500_000,
      RECEIPT_REF
    );

    expect(txHash).toBe(TX_HASH);
    expect(mockSendUserOperation).toHaveBeenCalledTimes(1);

    const request = mockSendUserOperation.mock.calls[0][0] as {
      network: string;
      calls: readonly [
        { to: Hex; value: bigint; data: Hex },
        { to: Hex; value: bigint; data: Hex },
      ];
    };

    expect(request.network).toBe("base-sepolia");
    expect(request.calls[0].to).toBe(USDC);
    expect(request.calls[0].value).toBe(0n);
    expect(request.calls[1].to).toBe(VAULT);
    expect(request.calls[1].value).toBe(0n);

    const approve = decodeFunctionData({ abi: erc20Abi, data: request.calls[0].data });
    expect(approve.functionName).toBe("approve");
    expect(approve.args).toEqual([VAULT, 1_500_000n]);

    const deposit = decodeFunctionData({ abi: vaultAbi, data: request.calls[1].data });
    expect(deposit.functionName).toBe("depositForAttestation");
    expect(deposit.args).toEqual([ATTESTATION_ID, CREATOR, 1_500_000n, RECEIPT_REF]);
  });
});
