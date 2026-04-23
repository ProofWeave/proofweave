import { ExternalLink, FileSearch, ShoppingBag, Code, Globe, Cpu } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

export interface AttestationMetadataView {
  title?: string;
  domain?: string;
  problemType?: string;
  keywords?: string[];
  abstract?: string;
  language?: string;
  sizeStats?: { inputTokens?: number; outputTokens?: number };
  format?: string;
  metadataStatus?: string;
}

export interface AttestationWithMetadata {
  attestationId: string;
  contentHash: string;
  creator: string;
  aiModel: string;
  createdAt: string;
  txHash: string;
  blockNumber: number;
  offchainRef: string;
  metadata?: AttestationMetadataView;
}

// ── Domain color mapping ────────────────────────────────────

const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  defi:             { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)',  text: '#A78BFA' },
  smart_contract:   { bg: 'rgba(6, 182, 212, 0.12)',  border: 'rgba(6, 182, 212, 0.3)',   text: '#22D3EE' },
  security:         { bg: 'rgba(239, 68, 68, 0.12)',   border: 'rgba(239, 68, 68, 0.3)',   text: '#F87171' },
  legal:            { bg: 'rgba(245, 158, 11, 0.12)',  border: 'rgba(245, 158, 11, 0.3)',  text: '#FBBF24' },
  data_analysis:    { bg: 'rgba(34, 197, 94, 0.12)',   border: 'rgba(34, 197, 94, 0.3)',   text: '#4ADE80' },
  general:          { bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.2)', text: '#94A3B8' },
};

function getDomainColor(domain?: string) {
  if (!domain) return DOMAIN_COLORS.general;
  return DOMAIN_COLORS[domain] || DOMAIN_COLORS.general;
}

const DOMAIN_LABELS: Record<string, string> = {
  defi: 'DeFi',
  smart_contract: 'Smart Contract',
  security: 'Security',
  legal: 'Legal',
  data_analysis: 'Data Analysis',
  code_review: 'Code Review',
  explanation: 'Explanation',
  security_analysis: 'Security Analysis',
};

// ── Component ───────────────────────────────────────────────

interface AttestationCardProps {
  attestation: AttestationWithMetadata;
  isPurchased: boolean;
  onSelect: (id: string) => void;
}

export function AttestationCard({ attestation, isPurchased, onSelect }: AttestationCardProps) {
  const meta = attestation.metadata;
  const domainColor = getDomainColor(meta?.domain);
  const hasMetadata = meta?.metadataStatus === 'ready' && meta?.title;

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="attestation-card"
      style={{ '--domain-bg': domainColor.bg, '--domain-border': domainColor.border } as React.CSSProperties}
      onClick={() => onSelect(attestation.attestationId)}
    >
      {/* Header: Title + Status */}
      <div className="attestation-card__header">
        <h3 className="attestation-card__title">
          {hasMetadata ? meta!.title : truncateHash(attestation.contentHash)}
        </h3>
        <div className="attestation-card__badges">
          {isPurchased && (
            <span className="attestation-card__badge attestation-card__badge--purchased">
              <ShoppingBag size={10} /> 구매됨
            </span>
          )}
          {meta?.metadataStatus === 'pending' && (
            <span className="attestation-card__badge attestation-card__badge--pending">분석 중</span>
          )}
          {meta?.metadataStatus === 'failed' && (
            <span className="attestation-card__badge attestation-card__badge--failed">분석 실패</span>
          )}
        </div>
      </div>

      {/* Domain + ProblemType */}
      <div className="attestation-card__meta-row">
        {meta?.domain && (
          <span className="attestation-card__domain" style={{ color: domainColor.text, background: domainColor.bg, borderColor: domainColor.border }}>
            {DOMAIN_LABELS[meta.domain] || meta.domain}
          </span>
        )}
        {meta?.problemType && (
          <span className="attestation-card__problem-type">
            {DOMAIN_LABELS[meta.problemType] || meta.problemType}
          </span>
        )}
        {meta?.language && (
          <span className="attestation-card__lang">
            <Globe size={11} /> {meta.language.toUpperCase()}
          </span>
        )}
      </div>

      {/* Abstract (if ready) */}
      {hasMetadata && meta?.abstract && (
        <p className="attestation-card__abstract">{meta.abstract}</p>
      )}

      {/* Keywords */}
      {hasMetadata && meta?.keywords && meta.keywords.length > 0 && (
        <div className="attestation-card__keywords">
          {meta.keywords.slice(0, 8).map((kw) => (
            <span key={kw} className="attestation-card__keyword">{kw}</span>
          ))}
          {meta.keywords.length > 8 && (
            <span className="attestation-card__keyword attestation-card__keyword--more">+{meta.keywords.length - 8}</span>
          )}
        </div>
      )}

      {/* Footer: Model + Date + Actions */}
      <div className="attestation-card__footer">
        <div className="attestation-card__footer-left">
          <span className="attestation-card__model">
            <Cpu size={12} /> {attestation.aiModel}
          </span>
          <span className="attestation-card__date">
            {formatDate(attestation.createdAt)}
          </span>
          {meta?.format === 'conversation' && (
            <span className="attestation-card__format" title="대화형">
              <Code size={11} />
            </span>
          )}
        </div>
        <div className="attestation-card__footer-right">
          <a
            href={`https://sepolia.basescan.org/tx/${attestation.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="attestation-card__tx-link"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} /> Tx
          </a>
          <button
            className={`attestation-card__action ${isPurchased ? 'attestation-card__action--secondary' : ''}`}
            onClick={(e) => { e.stopPropagation(); onSelect(attestation.attestationId); }}
          >
            <FileSearch size={13} /> {isPurchased ? '조회' : '상세'}
          </button>
        </div>
      </div>
    </div>
  );
}
