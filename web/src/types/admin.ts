export interface AdminSearchFilters {
  q: string;
  creator: string;
  aiModel: string;
  from: string;
  to: string;
}

export interface AttestationRow {
  attestationId: string;
  contentHash: string;
  creator: string;
  aiModel: string;
  createdAt: string;
  txHash: string;
  offchainRef?: string;
}

export interface SearchAttestationsResponse {
  count: number;
  attestations: AttestationRow[];
}

export interface AttestationDetail extends AttestationRow {
  blockNumber?: number;
}

export interface VerifyResponse {
  valid?: boolean;
  verified?: boolean;
  status?: 'verified' | 'mismatch';
  onchainHash?: string;
  error?: string;
}

export interface BatchVerifyItemResult {
  attestationId: string;
  contentHash: string;
  result: 'verified' | 'mismatch' | 'error';
  message?: string;
}

export interface BatchVerifySummary {
  total: number;
  verified: number;
  mismatch: number;
  error: number;
}
