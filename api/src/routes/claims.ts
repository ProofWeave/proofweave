import { Router } from "express";
import type { Request } from "express";
import { getAddress } from "viem";
import { authenticate } from "../middleware/authenticate.js";
import { getCreatorEarnings } from "../services/ledger.js";
import { claimFromSmartWallet } from "../services/wallet.js";
import { vaultRead } from "../contracts/attestationRegistry.js";
import { env } from "../config/env.js";

export const claimsRouter = Router();

/** Base Sepolia */
const CHAIN_ID = 84532;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * 인증 신원에서 creator 주소를 유도한다 (attest.ts:63-77과 동일 규칙).
 * - 웹 유저(apiKeyOwner가 "web:"으로 시작): creator = smartWalletAddress (CDP Smart Wallet)
 * - CLI/지갑 유저: creator = apiKeyOwner (본인 EOA)
 * client가 creator를 공급하지 못하게 하여 본인 잔액만 조회/claim 가능하도록 강제한다.
 */
function deriveCreator(req: Request): { creator: string | null; isWebUser: boolean } {
  const apiKeyOwner = req.apiKeyOwner!;
  const isWebUser = apiKeyOwner.startsWith("web:");
  const creator = isWebUser ? (req.smartWalletAddress ?? null) : apiKeyOwner;
  return { creator, isWebUser };
}

const vaultAddress = (env.VAULT_ADDRESS ?? env.PROXY_ADDRESS) as `0x${string}`;

/**
 * GET /claims/me
 * creator의 수익 현황을 read-only로 반환한다.
 * DB gross earned와 on-chain claimableBalance를 별개 필드로 분리한다 (절대 합산 금지).
 * on-chain read 실패는 500이 아니라 degraded(200 + warning)로 처리한다.
 */
claimsRouter.get("/claims/me", authenticate, async (req, res) => {
  const { creator, isWebUser } = deriveCreator(req);

  try {
    // 웹 유저인데 smart wallet이 아직 없는 경우 — creator 주소 자체가 없음
    if (!creator) {
      res.json({
        creator: null,
        isWebUser,
        chainId: CHAIN_ID,
        vaultAddress,
        usdcAddress: env.USDC_CONTRACT_ADDRESS,
        db: {
          grossEarnedUsdMicros: "0",
          reconciledDepositedUsdMicros: "0",
          unit: "usd-micros",
          paymentCount: 0,
          latestVaultTxHash: null,
          latestPaymentAt: null,
        },
        onchain: {
          claimableBaseUnits: null,
          unit: "usdc-base-units",
          available: false,
        },
        reconciled: false,
        warnings: ["no_creator_address"],
      });
      return;
    }

    const earnings = await getCreatorEarnings(creator);

    // on-chain read는 격리 — RPC 실패가 전체 endpoint를 500으로 만들지 않게 한다
    const warnings: string[] = [];
    let claimableBaseUnits: string | null = null;
    let onchainAvailable = false;
    try {
      const claimable = await vaultRead.read.claimableBalance([getAddress(creator)]);
      claimableBaseUnits = claimable.toString();
      onchainAvailable = true;
    } catch (err) {
      console.warn(
        "[claims] on-chain claimableBalance read failed:",
        err instanceof Error ? err.message : err
      );
      warnings.push("onchain_read_failed");
    }

    // 불변식: on-chain claimable(입금-claim)은 DB가 기록한 누적 입금액을 초과할 수 없다.
    // 초과하면 DB reconciliation이 뒤처진 것(또는 누락) → 정보성 warning.
    let reconciled = false;
    if (onchainAvailable && claimableBaseUnits !== null) {
      const claimableBig = BigInt(claimableBaseUnits);
      const depositedBig = BigInt(earnings.reconciledDepositedUsdMicros);
      if (claimableBig > depositedBig) {
        warnings.push("onchain_exceeds_db_reconciled");
      } else {
        reconciled = true;
      }
    }

    res.json({
      creator: creator.toLowerCase(),
      isWebUser,
      chainId: CHAIN_ID,
      vaultAddress,
      usdcAddress: env.USDC_CONTRACT_ADDRESS,
      db: {
        grossEarnedUsdMicros: earnings.grossEarnedUsdMicros,
        reconciledDepositedUsdMicros: earnings.reconciledDepositedUsdMicros,
        unit: "usd-micros",
        paymentCount: earnings.paymentCount,
        latestVaultTxHash: earnings.latestVaultTxHash,
        latestPaymentAt: earnings.latestPaymentAt,
      },
      onchain: {
        claimableBaseUnits,
        unit: "usdc-base-units",
        available: onchainAvailable,
      },
      reconciled,
      warnings,
    });
  } catch (err) {
    console.error("[claims] /claims/me failed:", err);
    res.status(500).json({ error: "Failed to fetch claim status" });
  }
});

// 동시 claim 가드: 같은 creator에 대한 in-flight claim을 직렬화해 더블클릭으로 인한
// 의도치 않은 연속 인출을 막는다. (컨트랙트가 over-claim은 막지만 의도 보호용)
const inFlightClaims = new Set<string>();

/**
 * POST /claims/execute  (웹 유저 전용)
 * creator 본인의 CDP smart wallet에서 claimCreatorBalance UserOp를 전송한다.
 * 결제와 동일한 위임 모델 — operator 키로 대신 서명하지 않는다.
 * Body: { amount: string(USDC base units), to?: string }
 */
claimsRouter.post("/claims/execute", authenticate, async (req, res) => {
  const { creator, isWebUser } = deriveCreator(req);

  // CLI/EOA 유저는 본인 지갑으로 직접 서명 — 백엔드 실행 경로 없음
  if (!isWebUser || !creator) {
    res.status(400).json({
      error: "claim execution is only available for web users with a smart wallet",
      hint: "CLI/EOA creators sign claimCreatorBalance directly with their own wallet",
    });
    return;
  }

  const { amount, to } = (req.body ?? {}) as { amount?: unknown; to?: unknown };

  // amount: string 정수(USDC base units) → bigint
  let amountBaseUnits: bigint;
  try {
    if (typeof amount !== "string" && typeof amount !== "number") throw new Error("type");
    amountBaseUnits = BigInt(amount);
  } catch {
    res.status(400).json({ error: "amount (string integer, USDC base units) is required" });
    return;
  }
  if (amountBaseUnits <= 0n) {
    res.status(400).json({ error: "amount must be greater than 0" });
    return;
  }

  // recipient: 기본은 creator 본인 smart wallet, 외부 주소 지정 허용
  let recipient: `0x${string}`;
  try {
    recipient = to ? getAddress(String(to)) : getAddress(creator);
  } catch {
    res.status(400).json({ error: "invalid recipient address" });
    return;
  }
  if (recipient.toLowerCase() === ZERO_ADDRESS) {
    res.status(400).json({ error: "recipient cannot be the zero address" });
    return;
  }

  // on-chain claimable 사전 검증 (컨트랙트 InsufficientClaimable 사전 차단)
  try {
    const claimable = await vaultRead.read.claimableBalance([getAddress(creator)]);
    if (amountBaseUnits > claimable) {
      res.status(400).json({
        error: "amount exceeds claimable balance",
        claimableBaseUnits: claimable.toString(),
      });
      return;
    }
  } catch (err) {
    console.error("[claims] pre-check claimableBalance failed:", err);
    res.status(502).json({ error: "Failed to read on-chain claimable balance" });
    return;
  }

  const lockKey = creator.toLowerCase();
  if (inFlightClaims.has(lockKey)) {
    res.status(409).json({ error: "a claim for this creator is already in progress" });
    return;
  }
  inFlightClaims.add(lockKey);

  try {
    const txHash = await claimFromSmartWallet(creator, amountBaseUnits, recipient);
    res.json({
      txHash,
      chainId: CHAIN_ID,
      amountBaseUnits: amountBaseUnits.toString(),
      to: recipient,
    });
  } catch (err) {
    console.error("[claims] /claims/execute failed:", err);
    res.status(502).json({
      error: "Claim transaction failed",
      detail: err instanceof Error ? err.message : "unknown error",
    });
  } finally {
    inFlightClaims.delete(lockKey);
  }
});
