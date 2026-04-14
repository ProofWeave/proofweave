import { ExternalLink, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAttestationDetail } from '../../services/adminApi';

interface Props {
  attestationId: string | null;
  open: boolean;
  onClose: () => void;
}

export function AttestationDetailModal({ attestationId, open, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'detail', attestationId],
    queryFn: () => getAttestationDetail(attestationId!),
    enabled: open && Boolean(attestationId),
  });

  if (!open) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onClose} role="presentation">
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="card-header">
          <span className="card-title">Attestation Detail</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>
        {isLoading ? (
          <div className="text-center" style={{ padding: 28 }}><span className="spinner" /></div>
        ) : isError || !data ? (
          <p className="text-sm" style={{ color: 'var(--accent-red)' }}>상세 조회에 실패했습니다.</p>
        ) : (
          <div className="admin-detail-grid">
            <div><strong>ID</strong><p className="mono">{data.attestationId}</p></div>
            <div><strong>Hash</strong><p className="mono">{data.contentHash}</p></div>
            <div><strong>Creator</strong><p className="mono">{data.creator}</p></div>
            <div><strong>Model</strong><p>{data.aiModel || '-'}</p></div>
            <div><strong>Created</strong><p>{new Date(data.createdAt).toLocaleString('ko-KR')}</p></div>
            <div><strong>Tx Hash</strong><p className="mono">{data.txHash}</p></div>
            {data.offchainRef && <div><strong>IPFS CID</strong><p className="mono">{data.offchainRef}</p></div>}
            <div className="flex gap-8 mt-8">
              <a
                href={`https://sepolia.basescan.org/tx/${data.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                <ExternalLink size={14} /> BaseScan
              </a>
              {data.offchainRef && (
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${data.offchainRef}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <ExternalLink size={14} /> IPFS
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
