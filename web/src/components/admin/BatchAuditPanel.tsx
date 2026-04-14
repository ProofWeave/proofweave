import type { BatchVerifyItemResult, BatchVerifySummary } from '../../types/admin';

interface Props {
  selectedCount: number;
  running: boolean;
  progress: { done: number; total: number };
  summary: BatchVerifySummary | null;
  logs: BatchVerifyItemResult[];
  onRun: () => void;
}

export function BatchAuditPanel({
  selectedCount,
  running,
  progress,
  summary,
  logs,
  onRun,
}: Props) {
  return (
    <div className="card mb-24">
      <div className="card-header">
        <span className="card-title">Batch Audit</span>
        <span className="text-xs text-muted">Selected {selectedCount}</span>
      </div>
      <div className="flex gap-12 items-center">
        <button
          className="btn btn-primary"
          onClick={onRun}
          disabled={selectedCount === 0 || running}
        >
          {running ? 'Running...' : 'Run Batch Verification'}
        </button>
        {running && (
          <span className="text-sm text-muted">
            {progress.done} / {progress.total}
          </span>
        )}
      </div>

      {summary && (
        <div className="mt-16 flex gap-8" style={{ flexWrap: 'wrap' }}>
          <span className="badge badge-info">Total {summary.total}</span>
          <span className="badge badge-success">Verified {summary.verified}</span>
          <span className="badge badge-warning">Mismatch {summary.mismatch}</span>
          <span className="badge badge-error">Error {summary.error}</span>
        </div>
      )}

      {logs.length > 0 && (
        <div className="admin-log-list mt-16">
          {logs.slice(0, 12).map((log) => (
            <div key={log.attestationId} className="admin-log-row">
              <span className="mono text-xs">{log.attestationId.slice(0, 10)}...</span>
              <span className={`badge ${
                log.result === 'verified'
                  ? 'badge-success'
                  : log.result === 'mismatch'
                    ? 'badge-warning'
                    : 'badge-error'
              }`}
              >
                {log.result}
              </span>
              {log.message && <span className="text-xs text-muted">{log.message}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
