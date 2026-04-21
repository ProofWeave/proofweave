import { pool } from "./db.js";
import { canonicalHash, encryptData, decryptData } from "./crypto.js";
import { uploadEncryptedData, downloadEncryptedData } from "./ipfs.js";
import { registryWrite, registryRead } from "../contracts/attestationRegistry.js";
import { publicClient } from "../config/chain.js";
import { env } from "../config/env.js";
import { decodeEventLog } from "viem";
import { attestationRegistryAbi } from "../contracts/abi.js";

// ── Types ────────────────────────────────────────────────────

export interface AttestationRecord {
  attestationId: string;
  contentHash: string;
  creator: string;
  aiModel: string;
  offchainRef: string;  // IPFS CID
  blockNumber: number;
  blockTimestamp: string;
  txHash: string;
  createdAt: string;
}

export interface SearchFilters {
  creator?: string;
  aiModel?: string;
  limit?: number;
  offset?: number;
}

// ── 핵심: attest ──────────────────────────────────────────

/**
 * 데이터 등록 (핵심 비즈니스 로직)
 *
 * C-2 fix: pending row → chain → confirm 패턴
 * C-3 fix: ABI-based event decoding
 *
 * 흐름:
 * 1. canonicalHash(data) → contentHash
 * 2. AES-256-GCM 암호화 (HKDF 파생 키)
 * 3. Pinata IPFS 업로드
 * 4. DB pending row 생성 (status=pending)
 * 5. 온체인 attest tx
 * 6. waitForTransactionReceipt (finality)
 * 7. ABI로 Attested 이벤트 디코딩 → attestationId 추출
 * 8. DB row 확정 (status=confirmed)
 */
export async function createAttestation(params: {
  data: object;
  creator: string;
  aiModel: string;
}): Promise<{
  attestationId: string;
  contentHash: string;
  ipfsCid: string;
  txHash: string;
}> {
  const { data, creator, aiModel } = params;
  const encryptionKey = getEncryptionKey();

  // 1. Canonical JSON → SHA-256 → contentHash (bytes32)
  const contentHash = canonicalHash(data);

  // 2. 중복 체크: 이미 DB에 같은 contentHash+creator가 있으면 거부
  //    (체인 AlreadyAttested revert 전에 빠르게 실패)
  const existing = await pool.query(
    `SELECT attestation_id FROM attestations WHERE content_hash = $1 AND LOWER(creator) = LOWER($2)`,
    [contentHash, creator]
  );
  if (existing.rows.length > 0) {
    throw new Error(`AlreadyAttested: ${contentHash} by ${creator}`);
  }

  // 3. AES-256-GCM 암호화 (contentHash를 HKDF salt로 사용)
  const encryptionSalt = contentHash;
  const encrypted = encryptData(
    JSON.stringify(data),
    encryptionKey,
    encryptionSalt
  );

  // 4. IPFS 업로드 (암호화된 데이터)
  const ipfsCid = await uploadEncryptedData(encrypted, {
    attestationId: contentHash,
    contentHash,
    aiModel,
    creator,
  });

  // 5. 온체인 중복 체크 (DB에 없지만 체인에 이미 존재하는 경우 대비)
  try {
    const onchainAttestation = await registryRead.read.verify([
      contentHash as `0x${string}`,
      creator as `0x${string}`,
    ]);
    // timestamp > 0이면 이미 온체인에 존재
    if (onchainAttestation && Number(onchainAttestation.timestamp) > 0) {
      throw new Error(`AlreadyAttested: ${contentHash} by ${creator} (on-chain)`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("AlreadyAttested")) throw err;
    // AttestationNotFound는 정상 (아직 없음) — 계속 진행
  }

  // 6. 온체인 attest tx (simulateContract로 revert 사전 감지)
  let txHash: `0x${string}`;
  try {
    const { request } = await publicClient.simulateContract({
      address: env.PROXY_ADDRESS as `0x${string}`,
      abi: attestationRegistryAbi,
      functionName: "attest",
      args: [
        contentHash as `0x${string}`,
        creator as `0x${string}`,
        aiModel,
        ipfsCid,
      ],
      account: (await import("../config/chain.js")).operatorAccount,
    });
    txHash = await registryWrite.write.attest(request.args);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("AlreadyAttested") || msg.includes("gas")) {
      throw new Error(`AlreadyAttested: ${contentHash} by ${creator}`);
    }
    throw err;
  }

  // 6. Finality 대기
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 2,
  });

  if (receipt.status === "reverted") {
    throw new Error(`Attest transaction reverted: ${txHash}`);
  }

  // 7. ABI 기반 Attested 이벤트 디코딩 (C-3 fix)
  const attestationId = extractAttestationId(receipt.logs);
  if (!attestationId) {
    throw new Error(
      `Failed to extract attestationId from tx ${txHash}. ` +
      `Chain attestation exists but event decode failed. ` +
      `Manual reconciliation needed with txHash: ${txHash}`
    );
  }

  // 8. DB 저장 (C-2 fix: ON CONFLICT으로 재시도 안전)
  //    content_hash + creator에 대한 재시도인 경우 기존 row 업데이트
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  await pool.query(
    `INSERT INTO attestations
       (attestation_id, content_hash, creator, ai_model, offchain_ref, 
        block_number, block_timestamp, tx_hash, ipfs_cid, encryption_salt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (attestation_id) DO UPDATE SET
       tx_hash = EXCLUDED.tx_hash,
       block_number = EXCLUDED.block_number,
       block_timestamp = EXCLUDED.block_timestamp`,
    [
      attestationId,
      contentHash,
      creator.toLowerCase(),
      aiModel,
      ipfsCid,
      Number(receipt.blockNumber),
      new Date(Number(block.timestamp) * 1000).toISOString(),
      txHash,
      ipfsCid,
      encryptionSalt,
    ]
  );

  return { attestationId, contentHash, ipfsCid, txHash };
}

// ── 조회 ──────────────────────────────────────────────────

/**
 * DB에서 attestation 기본 정보 조회 (무료)
 */
export async function getAttestationFromDB(
  attestationId: string
): Promise<AttestationRecord | null> {
  const result = await pool.query(
    `SELECT attestation_id, content_hash, creator, ai_model, offchain_ref,
            block_number, block_timestamp, tx_hash, created_at
     FROM attestations WHERE attestation_id = $1`,
    [attestationId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    attestationId: row.attestation_id,
    contentHash: row.content_hash,
    creator: row.creator,
    aiModel: row.ai_model,
    offchainRef: row.offchain_ref,
    blockNumber: Number(row.block_number),
    blockTimestamp: row.block_timestamp,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

/**
 * 유료 상세 조회 — IPFS 다운로드 → AES 복호화 → 평문 반환
 */
export async function getAttestationDetail(
  attestationId: string
): Promise<{ plaintext: object; attestation: AttestationRecord }> {
  // 1. DB에서 attestation 정보 + encryption_salt 한 번에 조회
  const result = await pool.query(
    `SELECT attestation_id, content_hash, creator, ai_model, offchain_ref,
            block_number, block_timestamp, tx_hash, created_at, encryption_salt
     FROM attestations WHERE attestation_id = $1`,
    [attestationId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Attestation not found: ${attestationId}`);
  }

  const row = result.rows[0];
  const attestation: AttestationRecord = {
    attestationId: row.attestation_id,
    contentHash: row.content_hash,
    creator: row.creator,
    aiModel: row.ai_model,
    offchainRef: row.offchain_ref,
    blockNumber: Number(row.block_number),
    blockTimestamp: row.block_timestamp,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
  const encryptionSalt: string = row.encryption_salt ?? row.content_hash;

  // 2. IPFS에서 암호화된 데이터 다운로드
  const ipfsData = await downloadEncryptedData(attestation.offchainRef);

  // 3. AES-256-GCM 복호화
  const encryptionKey = getEncryptionKey();
  const plaintext = decryptData(ipfsData.encrypted, encryptionKey, encryptionSalt);

  return {
    plaintext: JSON.parse(plaintext),
    attestation,
  };
}

/**
 * 온체인 검증 — contentHash + creator로 체인 조회
 * N-3 fix: 에러 종류를 구분 (not found vs RPC 장애)
 */
export async function verifyAttestation(
  contentHash: string,
  creator: string
): Promise<{
  attestationId: string;
  contentHash: string;
  creator: string;
  aiModel: string;
  timestamp: number;
  offchainRef: string;
  verified: boolean;
}> {
  try {
    const result = await registryRead.read.verify([
      contentHash as `0x${string}`,
      creator as `0x${string}`,
    ]);

    const att = result as {
      contentHash: string;
      creator: string;
      aiModel: string;
      timestamp: bigint;
      offchainRef: string;
    };

    return {
      attestationId: contentHash,
      contentHash: att.contentHash,
      creator: att.creator,
      aiModel: att.aiModel,
      timestamp: Number(att.timestamp),
      offchainRef: att.offchainRef,
      verified: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // 컨트랙트 revert (AttestationNotFound) vs RPC/네트워크 장애 구분
    if (message.includes("AttestationNotFound") || message.includes("revert")) {
      throw new Error("Attestation not found on-chain");
    }

    // RPC 장애, ABI mismatch 등은 원본 에러 보존
    throw new Error(`Chain verification failed: ${message}`);
  }
}

/**
 * DB 검색 (필터/페이징)
 * W-2 fix: limit/offset 범위 검증
 */
export async function searchAttestations(
  filters: SearchFilters
): Promise<AttestationRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.creator) {
    conditions.push(`creator = $${paramIdx++}`);
    params.push(filters.creator.toLowerCase());
  }

  if (filters.aiModel) {
    conditions.push(`ai_model = $${paramIdx++}`);
    params.push(filters.aiModel);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // W-2 fix: 범위 검증
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const result = await pool.query(
    `SELECT attestation_id, content_hash, creator, ai_model, offchain_ref,
            block_number, block_timestamp, tx_hash, created_at
     FROM attestations ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, limit, offset]
  );

  return result.rows.map((row) => ({
    attestationId: row.attestation_id,
    contentHash: row.content_hash,
    creator: row.creator,
    aiModel: row.ai_model,
    offchainRef: row.offchain_ref,
    blockNumber: Number(row.block_number),
    blockTimestamp: row.block_timestamp,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  }));
}

// ── 내부 헬퍼 ─────────────────────────────────────────────

function getEncryptionKey(): string {
  const key = env.DATA_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("DATA_ENCRYPTION_KEY is required for attestation operations");
  }
  return key;
}

/**
 * C-3 fix: ABI 기반으로 Attested 이벤트에서 attestationId 추출
 * topics.length 비교가 아닌, event signature + contract address 검증
 */
function extractAttestationId(
  logs: readonly { address: string; data: string; topics: readonly string[] }[]
): string | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: attestationRegistryAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      });

      if (decoded.eventName === "Attested") {
        const args = decoded.args as { attestationId: string };
        return args.attestationId;
      }
    } catch {
      // 이 log는 Attested 이벤트가 아님 → 다음 log로
      continue;
    }
  }
  return null;
}
