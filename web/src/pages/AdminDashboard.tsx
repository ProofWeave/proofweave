import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { searchAttestations, verifyContentHash } from '../services/adminApi';
import type {
  AdminSearchFilters,
  AttestationRow,
  BatchVerifyItemResult,
  BatchVerifySummary,
} from '../types/admin';
import { KpiCards } from '../components/admin/KpiCards';
import { AttestationFilters } from '../components/admin/AttestationFilters';
import { AttestationTable } from '../components/admin/AttestationTable';
import { BatchAuditPanel } from '../components/admin/BatchAuditPanel';
import { AttestationDetailModal } from '../components/admin/AttestationDetailModal';
import { ChartsSection } from '../components/admin/ChartsSection';

const DEFAULT_FILTERS: AdminSearchFilters = {
  q: '',
  creator: '',
  aiModel: '',
  from: '',
  to: '',
};

const PAGE_LIMIT = 20;

function toVerifyResult(status: unknown): 'verified' | 'mismatch' {
  if (status === true || status === 'verified') return 'verified';
  return 'mismatch';
}

export function AdminDashboard() {
  const [draftFilters, setDraftFilters] = useState<AdminSearchFilters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<AdminSearchFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedMap, setSelectedMap] = useState<Record<string, AttestationRow>>({});
  const [verificationRuns, setVerificationRuns] = useState(0);
  const [batchSummary, setBatchSummary] = useState<BatchVerifySummary | null>(null);
  const [batchLogs, setBatchLogs] = useState<BatchVerifyItemResult[]>([]);
  const [runningBatch, setRunningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'search', filters, page, PAGE_LIMIT],
    queryFn: () => searchAttestations(filters, page, PAGE_LIMIT),
  });

  const rows = query.data?.attestations ?? [];
  const hasNextPage = rows.length >= PAGE_LIMIT;

  const selectedIds = useMemo(() => new Set(Object.keys(selectedMap)), [selectedMap]);
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.attestationId));

  const totalCount = query.data?.count ?? 0;
  const last24h = rows.filter((row) => Date.now() - new Date(row.createdAt).getTime() <= 24 * 60 * 60 * 1000).length;
  const verifiedRatio = batchSummary && batchSummary.total > 0
    ? (batchSummary.verified / batchSummary.total) * 100
    : 0;

  const onSearch = () => {
    setPage(1);
    setFilters(draftFilters);
    setSelectedMap({});
  };

  const onReset = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setSelectedMap({});
  };

  const toggleSelect = (row: AttestationRow) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.attestationId]) {
        delete next[row.attestationId];
      } else {
        next[row.attestationId] = row;
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedMap((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          delete next[row.attestationId];
        });
        return next;
      });
      return;
    }

    setSelectedMap((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[row.attestationId] = row;
      });
      return next;
    });
  };

  const runBatchVerification = async () => {
    const selectedRows = Object.values(selectedMap);
    if (selectedRows.length === 0) return;

    setRunningBatch(true);
    setVerificationRuns((v) => v + 1);
    setBatchProgress({ done: 0, total: selectedRows.length });
    setBatchLogs([]);

    const result: BatchVerifySummary = { total: selectedRows.length, verified: 0, mismatch: 0, error: 0 };
    const logs: BatchVerifyItemResult[] = [];

    for (let i = 0; i < selectedRows.length; i += 1) {
      const row = selectedRows[i];
      try {
        const verify = await verifyContentHash(row.contentHash);
        const status = toVerifyResult(verify.verified ?? verify.valid ?? verify.status);
        result[status] += 1;
        logs.push({
          attestationId: row.attestationId,
          contentHash: row.contentHash,
          result: status,
          message: verify.error,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        result.error += 1;
        logs.push({
          attestationId: row.attestationId,
          contentHash: row.contentHash,
          result: 'error',
          message,
        });
      }
      setBatchProgress({ done: i + 1, total: selectedRows.length });
    }

    setBatchSummary(result);
    setBatchLogs(logs);
    setRunningBatch(false);
  };

  return (
    <>
      <div className="page-header admin-header-row">
        <div>
          <h2>Admin Audit Dashboard</h2>
          <p>실시간 감사 이력 조회와 배치 무결성 검증</p>
        </div>
        <button className="btn btn-secondary" onClick={() => query.refetch()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <KpiCards
        total={totalCount}
        last24h={last24h}
        verifiedRatio={verifiedRatio}
        verificationRuns={verificationRuns}
        loading={query.isLoading}
      />

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

      <BatchAuditPanel
        selectedCount={selectedIds.size}
        running={runningBatch}
        progress={batchProgress}
        summary={batchSummary}
        logs={batchLogs}
        onRun={runBatchVerification}
      />

      <ChartsSection rows={rows} />

      <AttestationDetailModal
        open={Boolean(detailId)}
        attestationId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
