import { ExternalLink, Eye, Check } from 'lucide-react';
import type { AttestationRow } from '../../types/admin';

interface Props {
  rows: AttestationRow[];
  selectedIds: Set<string>;
  onToggleSelect: (row: AttestationRow) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  loading: boolean;
  page: number;
  hasNextPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onViewDetail: (id: string) => void;
}

const truncate = (v: string) => (v.length > 14 ? `${v.slice(0, 8)}...${v.slice(-6)}` : v);

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

export function AttestationTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  loading,
  page,
  hasNextPage,
  onPrevPage,
  onNextPage,
  onViewDetail,
}: Props) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ margin: '8px 0 10px' }}>
        <button className="btn btn-secondary btn-sm" onClick={onToggleSelectAll} disabled={rows.length === 0}>
          {allSelected && rows.length > 0 ? '전체 해제' : '이 페이지 전체 선택'}
        </button>
        <span className="text-xs text-muted">Page {page}</span>
      </div>
      <div className="table-wrapper">
        <table className="queue-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>ID</th>
              <th>Content Hash</th>
              <th>Creator</th>
              <th>Model</th>
              <th>Date</th>
              <th>Links</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center" style={{ padding: 44 }}>
                  <span className="spinner" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted" style={{ padding: 44 }}>
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : rows.map((row) => {
              const selected = selectedIds.has(row.attestationId);
              return (
                <tr
                  key={row.attestationId}
                  className={`queue-row ${selected ? 'queue-row--selected' : ''}`}
                  onClick={() => onToggleSelect(row)}
                >
                  <td>
                    <span className={`queue-check ${selected ? 'queue-check--on' : ''}`} aria-hidden="true">
                      {selected && <Check size={13} />}
                    </span>
                  </td>
                  <td className="mono" title={row.attestationId}>{truncate(row.attestationId)}</td>
                  <td className="mono" title={row.contentHash}>{truncate(row.contentHash)}</td>
                  <td className="mono" title={row.creator}>{truncate(row.creator)}</td>
                  <td><span className="badge badge-purple">{row.aiModel || '-'}</span></td>
                  <td className="text-xs">{formatDate(row.createdAt)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-8">
                      <a
                        href={`https://sepolia.basescan.org/tx/${row.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="badge badge-info"
                        style={{ textDecoration: 'none' }}
                      >
                        Tx <ExternalLink size={12} />
                      </a>
                      {row.offchainRef && (
                        <a
                          href={`https://gateway.pinata.cloud/ipfs/${row.offchainRef}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="badge badge-success"
                          style={{ textDecoration: 'none' }}
                        >
                          IPFS <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onViewDetail(row.attestationId)}
                    >
                      <Eye size={14} /> 상세
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between mt-16">
        <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={onPrevPage}>
          이전
        </button>
        <button className="btn btn-secondary btn-sm" disabled={!hasNextPage} onClick={onNextPage}>
          다음
        </button>
      </div>
    </div>
  );
}
