/**
 * Receipt Store — sessionStorage 기반 결제 영수증 관리
 *
 * 백엔드 x402Gate가 결제 완료 시 발급하는 X-Access-Receipt 헤더를 저장.
 * 이후 같은 attestation 재요청 시 자동 첨부하여 중복 결제 방지.
 */
const RECEIPT_KEY_PREFIX = 'pw_receipt_';

export function saveReceipt(attestationId: string, receiptHeader: string): void {
  sessionStorage.setItem(`${RECEIPT_KEY_PREFIX}${attestationId}`, receiptHeader);
}

export function getReceipt(attestationId: string): string | null {
  return sessionStorage.getItem(`${RECEIPT_KEY_PREFIX}${attestationId}`);
}

export function clearReceipt(attestationId: string): void {
  sessionStorage.removeItem(`${RECEIPT_KEY_PREFIX}${attestationId}`);
}

/** 저장된 모든 receipt 개수 반환 (Dashboard KPI 용) */
export function getReceiptCount(): number {
  let count = 0;
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(RECEIPT_KEY_PREFIX)) count++;
  }
  return count;
}
