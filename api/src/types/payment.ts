/**
 * ProofWeave 결제 시스템 중앙 인터페이스 (Phase 2-4)
 *
 * receipt, pricing, ledger, wallet 에서 공유하는 타입을 한 곳에 정의.
 */

// ── AccessReceipt ───────────────────────────────────────────

export interface AccessReceipt {
  receiptId: string; // UUID v7
  attestationId: string;
  payer: string; // 지갑 주소 (lowercase)
  paymentMethod: "smart-wallet";
  txHash: string | null;
  amountUsdMicros: number;
  hmac: string; // HMAC-SHA256 서명
  paidAt: string; // ISO 8601
  expiresAt: string | null;
}

// ── AccessReceipt 헤더 형식 ──────────────────────────────────
// X-ACCESS-RECEIPT: {receiptId}.{hmac}

export interface ParsedReceipt {
  receiptId: string;
  hmac: string;
}

// ── Pricing ─────────────────────────────────────────────────

export interface PricingPolicy {
  attestationId: string;
  creatorAddress: string;
  priceUsdMicros: number; // 0 = 무료
  currency: string; // "USDC"
  network: string; // "eip155:84532"
}

// ── Ledger ───────────────────────────────────────────────────

export interface LedgerEntry {
  attestationId: string;
  payer: string;
  amountUsdMicros: number;
  paymentMethod: string;
  txHash: string | null;
  receiptId: string;
}

// ── Payment Quote (중복 결제 방지) ────────────────────────────

export interface PaymentQuote {
  quoteId: string;
  attestationId: string;
  payer: string;
  amountUsdMicros: number;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

// ── Smart Wallet ─────────────────────────────────────────────

export interface SmartWalletInfo {
  address: string;
  ownerAddress: string;
  balanceUsdMicros: number;
}
