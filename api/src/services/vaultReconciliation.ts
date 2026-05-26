import { publicClient } from "../config/chain.js";
import { attestationRegistryAbi } from "../contracts/abi.js";
import { env } from "../config/env.js";
import { pool } from "./db.js";
import { issueReceipt } from "./receipt.js";
import { recordPayment } from "./ledger.js";

export interface ReconciliationResult {
  processed: number;
  reconciled: number;
  failed: number;
}

/**
 * 온체인 Vault 이벤트를 스캔하여 DB에 누락된 영수증과 결제 원장을 복구(Reconciliation)합니다.
 * @param fromBlock 스캔을 시작할 블록 번호 (지정하지 않으면 최근 5000블록 또는 로컬 노드 0번 블록부터 조회)
 */
export async function reconcileUnresolvedDeposits(fromBlock?: bigint): Promise<ReconciliationResult> {
  const result: ReconciliationResult = { processed: 0, reconciled: 0, failed: 0 };

  try {
    const currentBlock = await publicClient.getBlockNumber();
    
    // 로컬 Anvil 혹은 테스트 환경을 고려하여 fromBlock 기본값 산출
    let scanFromBlock = fromBlock;
    if (scanFromBlock === undefined) {
      const offset = 1000n;
      scanFromBlock = currentBlock > offset ? currentBlock - offset : 0n;
    }

    console.log(`[Reconciliation] Scanning VaultDeposited events from block ${scanFromBlock} to ${currentBlock}...`);

    // 1. VaultDeposited 이벤트 로그 쿼리
    const logs = await publicClient.getLogs({
      address: env.VAULT_ADDRESS as `0x${string}`,
      event: {
        type: "event",
        name: "VaultDeposited",
        inputs: [
          { name: "receiptRef", type: "bytes32", indexed: true },
          { name: "attestationId", type: "bytes32", indexed: true },
          { name: "creator", type: "address", indexed: true },
          { name: "payer", type: "address", indexed: false },
          { name: "amount", type: "uint256", indexed: false }
        ]
      },
      fromBlock: scanFromBlock,
      toBlock: currentBlock
    });

    result.processed = logs.length;
    console.log(`[Reconciliation] Found ${logs.length} VaultDeposited events.`);

    for (const log of logs) {
      const { receiptRef, attestationId, creator, payer, amount } = log.args;
      if (!receiptRef || !attestationId || !creator || !payer || !amount) {
        continue;
      }

      const receiptRefStr = String(receiptRef).toLowerCase();
      const attestationIdStr = String(attestationId).toLowerCase();
      const creatorStr = String(creator).toLowerCase();
      const payerStr = String(payer).toLowerCase();
      const amountVal = Number(amount);
      const txHash = log.transactionHash || "";

      // 2. 이미 해당 vault_receipt_ref를 레퍼런스하는 영수증이 존재하지 않는지 조회 (중복 처리 방지)
      const existingReceipt = await pool.query(
        `SELECT receipt_id FROM access_receipts WHERE vault_receipt_ref = $1 LIMIT 1`,
        [receiptRefStr]
      );

      if (existingReceipt.rows.length > 0) {
        // 이미 DB에 성공적으로 저장된 영수증이 있음
        continue;
      }

      console.warn(`[Reconciliation] Detected un-reconciled on-chain deposit! receiptRef: ${receiptRefStr}, txHash: ${txHash}`);

      // 3. 트랜잭션 단위로 영수증 및 원장 생성
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1시간 유효기간 혹은 무제한 설정
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30일 간 유효

        const receipt = await issueReceipt(
          attestationIdStr,
          payerStr,
          "smart-wallet",
          amountVal,
          txHash,
          expiresAt,
          client,
          {
            creatorAddress: creatorStr,
            vaultAddress: env.VAULT_ADDRESS,
            vaultTxHash: txHash,
            vaultReceiptRef: receiptRefStr,
            claimableAmountUsdMicros: amountVal
          }
        );

        await recordPayment({
          attestationId: attestationIdStr,
          payer: payerStr,
          amountUsdMicros: amountVal,
          paymentMethod: "smart-wallet",
          txHash,
          receiptId: receipt.receiptId,
          creatorAddress: creatorStr,
          vaultAddress: env.VAULT_ADDRESS,
          vaultTxHash: txHash,
          vaultReceiptRef: receiptRefStr,
          claimableAmountUsdMicros: amountVal
        }, client);

        await client.query("COMMIT");
        result.reconciled++;
        console.log(`[Reconciliation] Successfully reconciled receiptRef: ${receiptRefStr} with receiptId: ${receipt.receiptId}`);
      } catch (err: unknown) {
        await client.query("ROLLBACK");
        result.failed++;
        console.error(`[Reconciliation] Failed to reconcile receiptRef ${receiptRefStr}:`, err);
      } finally {
        client.release();
      }
    }
  } catch (err: unknown) {
    console.error("[Reconciliation] Error scanning chain logs:", err);
  }

  return result;
}

/**
 * 백그라운드에서 주기적으로 온체인 이벤트를 추적하여 DB 데이터를 갱신하는 스케줄러를 구동합니다.
 */
export function startReconciliationScheduler(intervalMs = 3 * 60 * 1000): NodeJS.Timeout {
  console.log(`[Reconciliation] Initializing background reconciliation scheduler (every ${intervalMs / 1000}s)...`);
  
  // 기동 즉시 한 번 실행
  reconcileUnresolvedDeposits().catch(err => {
    console.error("[Reconciliation] Background reconciliation startup error:", err);
  });

  return setInterval(async () => {
    try {
      const stats = await reconcileUnresolvedDeposits();
      if (stats.reconciled > 0) {
        console.log(`[Reconciliation] Scheduler summary: Reconciled ${stats.reconciled} payments.`);
      }
    } catch (err) {
      console.error("[Reconciliation] Scheduler execution error:", err);
    }
  }, intervalMs);
}
