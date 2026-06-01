import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { searchAttestations, verifyContentHash } from '../services/adminApi';
import type {
  AdminSearchFilters,
  AttestationRow,
  BatchVerifyItemResult,
  BatchVerifyStatus,
  BatchVerifySummary,
} from '../types/admin';
import { AttestationFilters } from '../components/admin/AttestationFilters';
import { AttestationTable } from '../components/admin/AttestationTable';
import { BatchAuditPanel } from '../components/admin/BatchAuditPanel';
import { AttestationDetailModal } from '../components/admin/AttestationDetailModal';

const DEFAULT_FILTERS: AdminSearchFilters = {
  q: '',
  creator: '',
  aiModel: '',
  from: '',
  to: '',
};

const PAGE_LIMIT = 20;
const EMPTY_ATTESTATION_ROWS: AttestationRow[] = [];

/** verify 응답을 4-상태로 정규화 — not_found를 mismatch와 구분 */
function toVerifyResult(verify: { verified?: boolean; valid?: boolean; status?: string; error?: string }): BatchVerifyStatus {
  if (verify.verified === true || verify.valid === true || verify.status === 'verified') return 'verified';
  const err = (verify.error || '').toLowerCase();
  if (err.includes('not found') || err.includes('not_found') || err.includes('찾을 수 없')) return 'not_found';
  return 'mismatch';
}

export function AdminDashboard() {
  const [draftFilters, setDraftFilters] = useState<AdminSearchFilters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<AdminSearchFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedMap, setSelectedMap] = useState<Record<string, AttestationRow>>({});
  const [batchSummary, setBatchSummary] = useState<BatchVerifySummary | null>(null);
  const [batchLogs, setBatchLogs] = useState<BatchVerifyItemResult[]>([]);
  const [runningBatch, setRunningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const query = useQuery({
    queryKey: ['admin', 'search', filters, page, PAGE_LIMIT],
    queryFn: () => searchAttestations(filters, page, PAGE_LIMIT),
  });

  const rows = query.data?.attestations ?? EMPTY_ATTESTATION_ROWS;
  const hasNextPage = rows.length >= PAGE_LIMIT;

  const selectedIds = useMemo(() => new Set(Object.keys(selectedMap)), [selectedMap]);
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.attestationId));
  const totalCount = query.data?.count ?? 0;

  const onSearch = () => {
    setPage(1);
    setFilters(draftFilters);
  };

  const onReset = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const toggleSelect = (row: AttestationRow) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.attestationId]) delete next[row.attestationId];
      else next[row.attestationId] = row;
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allSelected) rows.forEach((row) => delete next[row.attestationId]);
      else rows.forEach((row) => { next[row.attestationId] = row; });
      return next;
    });
  };

  const cancelBatch = () => { cancelRef.current = true; };

  const runBatchVerification = async () => {
    const selectedRows = Object.values(selectedMap);
    if (selectedRows.length === 0) return;

    cancelRef.current = false;
    setRunningBatch(true);
    setBatchProgress({ done: 0, total: selectedRows.length });
    setBatchLogs([]);
    setBatchSummary(null);

    const result: BatchVerifySummary = { total: selectedRows.length, verified: 0, mismatch: 0, not_found: 0, error: 0 };
    const logs: BatchVerifyItemResult[] = [];

    for (let i = 0; i < selectedRows.length; i += 1) {
      if (cancelRef.current) break;
      const row = selectedRows[i];
      setCurrentId(row.attestationId);
      const startedAt = performance.now();
      try {
        const verify = await verifyContentHash(row.contentHash, row.creator);
        const status = toVerifyResult(verify);
        result[status] += 1;
        logs.push({
          attestationId: row.attestationId,
          contentHash: row.contentHash,
          creator: row.creator,
          result: status,
          onchainHash: verify.onchainHash,
          elapsedMs: Math.round(performance.now() - startedAt),
          message: verify.error,
        });
      } catch (err) {
        result.error += 1;
        logs.push({
          attestationId: row.attestationId,
          contentHash: row.contentHash,
          creator: row.creator,
          result: 'error',
          elapsedMs: Math.round(performance.now() - startedAt),
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      setBatchProgress({ done: i + 1, total: selectedRows.length });
      setBatchLogs([...logs]);
    }

    setCurrentId(null);
    result.total = logs.length;
    setBatchSummary(result);
    setRunningBatch(false);
  };

  return (
    <>
      <div className="page-header admin-header-row">
        <div>
          <h2>Verification</h2>
          <p>선택한 attestation의 온체인 무결성을 일괄 검증합니다</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => query.refetch()}>
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {/* Step 1 — Queue selector: search/filter feeds the verification queue */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">1 · 검증할 항목 선택</span>
          <span className="text-xs text-muted">{selectedIds.size}개 선택됨 · 전체 {totalCount.toLocaleString()}건</span>
        </div>
        <AttestationFilters
          value={draftFilters}
          onChange={setDraftFilters}
          onSearch={onSearch}
          onReset={onReset}
        />
        <AttestationTable
          rows={rows}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allSelected={allSelected}
          loading={query.isLoading}
          page={page}
          hasNextPage={hasNextPage}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => p + 1)}
          onViewDetail={setDetailId}
        />
      </div>

      {/* Step 2 — Verification run + live result (stats inline in the panel) */}
      <BatchAuditPanel
        selectedCount={selectedIds.size}
        running={runningBatch}
        progress={batchProgress}
        currentId={currentId}
        summary={batchSummary}
        logs={batchLogs}
        onRun={runBatchVerification}
        onCancel={cancelBatch}
        onViewDetail={setDetailId}
      />

      <AttestationDetailModal
        open={Boolean(detailId)}
        attestationId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
