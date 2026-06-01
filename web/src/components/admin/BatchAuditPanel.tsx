import { Play, Square, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import type { BatchVerifyItemResult, BatchVerifyStatus, BatchVerifySummary } from '../../types/admin';

interface Props {
  selectedCount: number;
  running: boolean;
  progress: { done: number; total: number };
  currentId: string | null;
  summary: BatchVerifySummary | null;
  logs: BatchVerifyItemResult[];
  onRun: () => void;
  onCancel: () => void;
  onViewDetail: (id: string) => void;
}

const STATUS_META: Record<BatchVerifyStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  verified: { label: 'verified', cls: 'vstatus--ok', icon: CheckCircle2 },
  mismatch: { label: 'mismatch', cls: 'vstatus--warn', icon: AlertTriangle },
  not_found: { label: 'not found', cls: 'vstatus--muted', icon: HelpCircle },
  error: { label: 'error', cls: 'vstatus--err', icon: XCircle },
};

const short = (h: string) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || '—');

export function BatchAuditPanel({
  selectedCount,
  running,
  progress,
  currentId,
  summary,
  logs,
  onRun,
  onCancel,
  onViewDetail,
}: Props) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="card verification-panel">
      <div className="verification-panel__head">
        <div>
          <span className="card-title">2 · 검증 실행</span>
          <p className="text-xs text-muted" style={{ marginTop: 2 }}>
            {running ? '검증 진행 중…' : selectedCount > 0 ? `${selectedCount}개 항목이 큐에 있습니다` : '위에서 검증할 항목을 선택하세요'}
          </p>
        </div>
        {running ? (
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>
            <Square size={14} /> 중단
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onRun} disabled={selectedCount === 0}>
            <Play size={14} /> 검증 실행
          </button>
        )}
      </div>

      {/* Progress bar */}
      {(running || progress.total > 0) && (
        <div className="verification-progress">
          <div className="verification-progress__bar">
            <div className="verification-progress__fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs mono text-muted">{progress.done} / {progress.total}</span>
        </div>
      )}

      {/* Summary pills */}
      {summary && (
        <div className="verification-summary">
          <span className="vchip vchip--ok"><CheckCircle2 size={12} /> {summary.verified} verified</span>
          <span className="vchip vchip--warn"><AlertTriangle size={12} /> {summary.mismatch} mismatch</span>
          <span className="vchip vchip--muted"><HelpCircle size={12} /> {summary.not_found} not found</span>
          <span className="vchip vchip--err"><XCircle size={12} /> {summary.error} error</span>
        </div>
      )}

      {/* Live run log — full list, current item highlighted, hash comparison */}
      {logs.length > 0 && (
        <div className="verification-log">
          {logs.map((log) => {
            const meta = STATUS_META[log.result];
            const Icon = meta.icon;
            const isCurrent = log.attestationId === currentId;
            const hashMismatch = log.result === 'mismatch' && log.onchainHash;
            return (
              <button
                key={log.attestationId}
                className={`verification-row ${isCurrent ? 'verification-row--current' : ''}`}
                onClick={() => onViewDetail(log.attestationId)}
              >
                <span className={`vstatus ${meta.cls}`}>
                  <Icon size={12} /> {meta.label}
                </span>
                <span className="verification-row__id mono">{log.attestationId.slice(0, 12)}…</span>
                <span className="verification-row__hash mono">
                  {hashMismatch ? (
                    <>
                      <span className="hash-local" title={`local: ${log.contentHash}`}>{short(log.contentHash)}</span>
                      <span className="hash-sep">≠</span>
                      <span className="hash-chain" title={`on-chain: ${log.onchainHash}`}>{short(log.onchainHash!)}</span>
                    </>
                  ) : (
                    <span className="text-muted" title={log.contentHash}>{short(log.contentHash)}</span>
                  )}
                </span>
                {log.message && <span className="verification-row__msg text-xs text-muted">{log.message}</span>}
                {log.elapsedMs != null && <span className="verification-row__time mono text-xs text-muted">{log.elapsedMs}ms</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
