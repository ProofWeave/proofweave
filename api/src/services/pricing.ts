import { pool } from "./db.js";

export interface PricingPolicy {
  attestationId: string;
  creatorAddress: string;
  priceUsdMicros: number;
  currency: string;
  network: string;
}

/**
 * 가격 조회
 * null = 정책 미설정 (무료로 간주)
 */
export async function getPrice(
  attestationId: string
): Promise<PricingPolicy | null> {
  const result = await pool.query(
    `SELECT attestation_id, creator_address, price_usd_micros, currency, network
     FROM pricing_policies WHERE attestation_id = $1`,
    [attestationId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    attestationId: row.attestation_id,
    creatorAddress: row.creator_address,
    priceUsdMicros: Number(row.price_usd_micros),
    currency: row.currency,
    network: row.network,
  };
}

/**
 * 가격 설정 (UPSERT)
 * creator 본인만 설정 가능 (라우트에서 권한 검증)
 */
export async function setPrice(
  attestationId: string,
  creatorAddress: string,
  priceUsdMicros: number
): Promise<PricingPolicy | null> {
  // UPSERT: 신규 삽입 또는 동일 creator인 경우에만 업데이트
  const result = await pool.query(
    `INSERT INTO pricing_policies (attestation_id, creator_address, price_usd_micros)
     VALUES ($1, $2, $3)
     ON CONFLICT (attestation_id) DO UPDATE SET
       price_usd_micros = EXCLUDED.price_usd_micros,
       updated_at = NOW()
     WHERE pricing_policies.creator_address = $2
     RETURNING attestation_id, creator_address, price_usd_micros, currency, network`,
    [attestationId, creatorAddress.toLowerCase(), priceUsdMicros]
  );

  // RETURNING이 비어있으면 다른 creator가 설정한 가격 → 권한 없음
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    attestationId: row.attestation_id,
    creatorAddress: row.creator_address,
    priceUsdMicros: Number(row.price_usd_micros),
    currency: row.currency,
    network: row.network,
  };
}

/**
 * USD micros → USDC smallest unit 변환
 * USDC는 6 decimals, 1 USD micros = 1 USDC smallest unit
 * (둘 다 1 USD = 1,000,000이므로 동일)
 */
export function toUsdcAmount(priceUsdMicros: number): string {
  return String(priceUsdMicros);
}
