import { useState } from 'react';
import { ExternalLink, FileSearch, ShoppingBag, Code, Globe, Cpu, ChevronDown, ChevronUp } from 'lucide-react';

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
  defi:             { bg: 'rgba(139, 58, 74, 0.08)',  border: 'rgba(139, 58, 74, 0.20)',  text: '#8B3A4A' },
  smart_contract:   { bg: 'rgba(90, 125, 124, 0.08)', border: 'rgba(90, 125, 124, 0.20)', text: '#5A7D7C' },
  security:         { bg: 'rgba(181, 66, 72, 0.08)',  border: 'rgba(181, 66, 72, 0.20)',  text: '#B54248' },
  legal:            { bg: 'rgba(158, 107, 58, 0.08)', border: 'rgba(158, 107, 58, 0.20)', text: '#9E6B3A' },
  data_analysis:    { bg: 'rgba(74, 124, 89, 0.08)',  border: 'rgba(74, 124, 89, 0.20)',  text: '#4A7C59' },
  general:          { bg: 'rgba(142, 122, 128, 0.08)',border: 'rgba(142, 122, 128, 0.15)',text: '#8E7A80' },
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

const KEYWORD_LIMIT = 6;

export function AttestationCard({ attestation, isPurchased, onSelect }: AttestationCardProps) {
  const meta = attestation.metadata;
  const domainColor = getDomainColor(meta?.domain);
  const hasMetadata = meta?.metadataStatus === 'ready' && meta?.title;
  const [keywordsExpanded, setKeywordsExpanded] = useState(false);

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

  const allKeywords = meta?.keywords ?? [];
  const visibleKeywords = keywordsExpanded ? allKeywords : allKeywords.slice(0, KEYWORD_LIMIT);
  const hasMore = allKeywords.length > KEYWORD_LIMIT;

  const toggleKeywords = (e: React.MouseEvent) => {
    e.stopPropagation();
    setKeywordsExpanded((prev) => !prev);
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

      {/* Keywords — expandable */}
      {hasMetadata && allKeywords.length > 0 && (
        <div className="attestation-card__keywords">
          {visibleKeywords.map((kw) => (
            <span key={kw} className="attestation-card__keyword">{kw}</span>
          ))}
          {hasMore && (
            <button
              className="attestation-card__keyword attestation-card__keyword--toggle"
              onClick={toggleKeywords}
              title={keywordsExpanded ? '접기' : '더보기'}
            >
              {keywordsExpanded ? (
                <><ChevronUp size={11} /> 접기</>
              ) : (
                <>+{allKeywords.length - KEYWORD_LIMIT} <ChevronDown size={11} /></>
              )}
            </button>
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
