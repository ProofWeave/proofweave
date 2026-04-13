import { api } from '../lib/api';
import type {
  AdminSearchFilters,
  AttestationDetail,
  SearchAttestationsResponse,
  VerifyResponse,
} from '../types/admin';

const DEFAULT_LIMIT = 20;

export async function searchAttestations(
  filters: AdminSearchFilters,
  page = 1,
  limit = DEFAULT_LIMIT,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.creator.trim()) params.set('creator', filters.creator.trim());
  if (filters.aiModel.trim()) params.set('aiModel', filters.aiModel.trim());
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  return api.get<SearchAttestationsResponse>(`/search?${params}`);
}

export async function getAttestationDetail(attestationId: string) {
  return api.get<AttestationDetail>(`/attestations/${attestationId}`);
}

export async function verifyContentHash(contentHash: string) {
  return api.get<VerifyResponse>(`/verify/${contentHash}`);
}
