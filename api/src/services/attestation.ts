import { pool } from "./db.js";
import { canonicalHash, encryptDataV2, decryptData, decryptDataV2 } from "./crypto.js";
import { uploadEncryptedDataV2, downloadIPFSPayload } from "./ipfs.js";
import { registryWrite, registryRead } from "../contracts/attestationRegistry.js";
import { publicClient } from "../config/chain.js";
import { env } from "../config/env.js";
import { decodeEventLog } from "viem";
import { attestationRegistryAbi } from "../contracts/abi.js";
import { extractRuleMetadata, enrichWithLLM } from "./metadata.js";

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
  q?: string;          // 범용 검색어 (자동 패턴 감지)
  domain?: string;     // T3: 메타데이터 도메인 필터
  problemType?: string; // T3: 메타데이터 문제 유형 필터
  creator?: string;
  aiModel?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  attestations: AttestationRecord[];
  totalCount: number;
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

  // 3. [V2] 봉투 암호화 (DEK 랜덤 생성 → 데이터 암호화 → KEK로 DEK 래핑)
  const envelope = encryptDataV2(
    JSON.stringify(data),
    encryptionKey
  );

  // 4. IPFS 업로드 (V2 페이로드: encrypted + wrappedDEK)
  const ipfsCid = await uploadEncryptedDataV2(envelope, {
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

  // 6. 온체인 attest tx (simulateContract → writeContract with manual gas)
  let txHash: `0x${string}`;
  const attestArgs = [
    contentHash as `0x${string}`,
    creator as `0x${string}`,
    aiModel,
    ipfsCid,
  ] as const;

  try {
    // 6a. simulateContract로 revert 사전 감지 (gas estimation 없이 revert만 확인)
    await publicClient.simulateContract({
      address: env.PROXY_ADDRESS as `0x${string}`,
      abi: attestationRegistryAbi,
      functionName: "attest",
      args: attestArgs,
      account: (await import("../config/chain.js")).operatorAccount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[attest] Simulation failed:", msg.slice(0, 300));
    if (msg.includes("AlreadyAttested")) {
      throw new Error(`AlreadyAttested: ${contentHash} by ${creator}`);
    }
    throw new Error(`Contract simulation failed: ${msg.slice(0, 200)}`);
  }

  try {
    // 6b. 실제 TX 전송 — gas를 수동 지정하여 공개 RPC의 estimation 불안정 회피
    const { walletClient: wc } = await import("../config/chain.js");
    txHash = await wc.writeContract({
      address: env.PROXY_ADDRESS as `0x${string}`,
      abi: attestationRegistryAbi,
      functionName: "attest",
      args: attestArgs,
      gas: 500_000n, // attest는 ~150k gas 사용, 여유 포함
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[attest] Chain write failed:", msg.slice(0, 300));
    if (msg.includes("AlreadyAttested")) {
      throw new Error(`AlreadyAttested: ${contentHash} by ${creator}`);
    }
    throw new Error(`Chain write failed: ${msg.slice(0, 200)}`);
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

  // T3: 규칙 기반 메타데이터 추출 (동기, 실패 없음)
  const ruleMetadata = extractRuleMetadata(data as Record<string, unknown>, aiModel);

  await pool.query(
    `INSERT INTO attestations
       (attestation_id, content_hash, creator, ai_model, offchain_ref, 
        block_number, block_timestamp, tx_hash, ipfs_cid, encryption_salt,
        encryption_version, metadata, keywords, metadata_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      contentHash,         // encryption_salt (V1 호환)
      2,                   // encryption_version = 2 (V2 Envelope)
      JSON.stringify(ruleMetadata),
      [],
      "pending",
    ]
  );

  // T3: 비동기 LLM 메타데이터 보강 (fire-and-forget, 실패해도 attest 영향 없음)
  enrichWithLLM(attestationId, data as Record<string, unknown>, aiModel)
    .catch((err) => {
      console.error(`[metadata] enrichment failed for ${attestationId}:`, err);
      pool.query(
        `UPDATE attestations SET metadata_status = 'failed' WHERE attestation_id = $1`,
        [attestationId]
      ).catch(() => {});
    });

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
 * 유료 상세 조회 — IPFS 다운로드 → 암호화 버전에 따라 복호화 → 평문 반환
 *
 * V1 (encryption_version=1): HKDF 파생키 복호화
 * V2 (encryption_version=2): 봉투 암호화 DEK 언래핑 → 복호화
 */
export async function getAttestationDetail(
  attestationId: string
): Promise<{ plaintext: object; attestation: AttestationRecord }> {
  // 1. DB에서 attestation 정보 + encryption_version 조회
  const result = await pool.query(
    `SELECT attestation_id, content_hash, creator, ai_model, offchain_ref,
            block_number, block_timestamp, tx_hash, created_at,
            encryption_salt, encryption_version
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

  const encryptionKey = getEncryptionKey();
  const encryptionVersion: number = row.encryption_version ?? 1;

  // 2. IPFS에서 페이로드 다운로드 (v1/v2 자동 분기)
  const ipfsData = await downloadIPFSPayload(attestation.offchainRef);

  // 3. 암호화 버전에 따라 복호화
  let plaintext: string;

  if (encryptionVersion === 2 && ipfsData.version === 2) {
    // V2: 봉투 암호화 — DEK 언래핑 → 데이터 복호화
    plaintext = decryptDataV2(ipfsData.encrypted, ipfsData.wrappedDEK, encryptionKey);
  } else if (encryptionVersion === 1 && (ipfsData.version === 1 || !ipfsData.version)) {
    // V1 Legacy: HKDF 파생키 복호화
    const encryptionSalt: string = row.encryption_salt ?? row.content_hash;
    plaintext = decryptData(ipfsData.encrypted, encryptionKey, encryptionSalt);
  } else {
    // 버전 불일치 — 데이터 무결성 오류
    throw new Error(
      `Encryption version mismatch: DB=${encryptionVersion}, IPFS=${ipfsData.version}. ` +
      `attestationId=${attestationId}. Data integrity may be compromised.`
    );
  }

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
): Promise<SearchResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // q 파라미터: 문맥 기반 자동 감지
  if (filters.q) {
    const q = filters.q.trim();
    const isHex64 = /^0x[0-9a-fA-F]{64}$/.test(q);  // hash (attestation_id, content_hash, tx_hash)
    const isHex40 = /^0x[0-9a-fA-F]{40}$/.test(q);  // address (creator)

    if (isHex64) {
      conditions.push(`(attestation_id = $${paramIdx} OR content_hash = $${paramIdx} OR tx_hash = $${paramIdx})`);
      params.push(q.toLowerCase());
      paramIdx++;
    } else if (isHex40) {
      conditions.push(`LOWER(creator) = LOWER($${paramIdx++})`);
      params.push(q);
    } else {
      // 텍스트 검색: title, abstract, ai_model ILIKE + keywords 정확 일치 + keywords 텍스트 ILIKE
      const ilikeParam = paramIdx++;
      const keywordParam = paramIdx++;
      conditions.push(`(
        ai_model ILIKE $${ilikeParam}
        OR metadata->>'title' ILIKE $${ilikeParam}
        OR metadata->>'abstract' ILIKE $${ilikeParam}
        OR keywords @> ARRAY[$${keywordParam}]::TEXT[]
        OR array_to_string(keywords, ' ') ILIKE $${ilikeParam}
      )`);
      params.push(`%${q.toLowerCase()}%`);
      params.push(q.toLowerCase());
    }
  }

  if (filters.creator) {
    conditions.push(`LOWER(creator) = LOWER($${paramIdx++})`);
    params.push(filters.creator);
  }

  if (filters.aiModel) {
    conditions.push(`ai_model = $${paramIdx++}`);
    params.push(filters.aiModel);
  }

  // T3: 메타데이터 필터
  if (filters.domain) {
    conditions.push(`metadata->>'domain' = $${paramIdx++}`);
    params.push(filters.domain);
  }
  if (filters.problemType) {
    conditions.push(`metadata->>'problemType' = $${paramIdx++}`);
    params.push(filters.problemType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // W-2 fix: 범위 검증
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  // 전체 건수 조회
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM attestations ${where}`,
    params
  );
  const totalCount = Number(countResult.rows[0].count);

  // 결과 조회 (LIMIT/OFFSET) — T3: metadata, keywords, metadata_status 추가
  // T5: pricing subquery로 가격 정보 포함
  const result = await pool.query(
    `SELECT attestation_id, content_hash, creator, ai_model, offchain_ref,
            block_number, block_timestamp, tx_hash, created_at,
            metadata, keywords, metadata_status,
            COALESCE((SELECT pp.price_usd_micros FROM pricing_policies pp WHERE pp.attestation_id = attestations.attestation_id), 0) AS price_usd_micros
     FROM attestations ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, limit, offset]
  );

  return {
    totalCount,
    attestations: result.rows.map((row) => ({
      attestationId: row.attestation_id,
      contentHash: row.content_hash,
      creator: row.creator,
      aiModel: row.ai_model,
      offchainRef: row.offchain_ref,
      blockNumber: Number(row.block_number),
      blockTimestamp: row.block_timestamp,
      txHash: row.tx_hash,
      createdAt: row.created_at,
      priceUsdMicros: Number(row.price_usd_micros) || 0,
      // T3: Tier 1 메타데이터
      metadata: row.metadata ? {
        title: row.metadata.title,
        domain: row.metadata.domain,
        problemType: row.metadata.problemType,
        keywords: row.keywords || [],
        abstract: row.metadata.abstract,
        language: row.metadata.language,
        sizeStats: row.metadata.sizeStats,
        format: row.metadata.format,
        metadataStatus: row.metadata_status,
      } : undefined,
    })),
  };
}

/**
 * 검색 필터 옵션 동적 조회
 * T4: LLM이 추출한 메타데이터에서 실제 존재하는 domain/problemType 목록 반환
 */
export async function getSearchFacets(): Promise<{
  domains: Array<{ value: string; count: number }>;
  problemTypes: Array<{ value: string; count: number }>;
}> {
  const [domainResult, ptResult] = await Promise.all([
    pool.query(
      `SELECT metadata->>'domain' AS value, COUNT(*) AS count
       FROM attestations
       WHERE metadata->>'domain' IS NOT NULL AND metadata->>'domain' != ''
       GROUP BY metadata->>'domain'
       ORDER BY count DESC`
    ),
    pool.query(
      `SELECT metadata->>'problemType' AS value, COUNT(*) AS count
       FROM attestations
       WHERE metadata->>'problemType' IS NOT NULL AND metadata->>'problemType' != ''
       GROUP BY metadata->>'problemType'
       ORDER BY count DESC`
    ),
  ]);

  return {
    domains: domainResult.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
    problemTypes: ptResult.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
  };
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
