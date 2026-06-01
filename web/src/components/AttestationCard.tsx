import { useState } from 'react';
import { ExternalLink, FileSearch, Code, Globe, Cpu, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { basescanTxUrl, isEvmTxHash } from '../lib/tx';

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
  priceUsdMicros?: number;
  metadata?: AttestationMetadataView;
}

// ── Domain color mapping ────────────────────────────────────

const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  defi:             { bg: 'rgba(34, 211, 238, 0.10)',  border: 'rgba(34, 211, 238, 0.22)',  text: '#22D3EE' },
  smart_contract:   { bg: 'rgba(116, 190, 180, 0.10)', border: 'rgba(116, 190, 180, 0.22)', text: '#74BEB4' },
  security:         { bg: 'rgba(247, 108, 108, 0.10)', border: 'rgba(247, 108, 108, 0.22)', text: '#F76C6C' },
  legal:            { bg: 'rgba(245, 158, 11, 0.10)',  border: 'rgba(245, 158, 11, 0.22)',  text: '#F59E0B' },
  data_analysis:    { bg: 'rgba(86, 197, 150, 0.10)',  border: 'rgba(86, 197, 150, 0.22)',  text: '#56C596' },
  general:          { bg: 'rgba(159, 177, 188, 0.10)', border: 'rgba(159, 177, 188, 0.18)', text: '#9FB1BC' },
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
  onCreatorSelect?: (creator: string) => void;
  onDomainSelect?: (domain: string) => void;
}

const KEYWORD_LIMIT = 6;

export function AttestationCard({ attestation, isPurchased, onSelect, onCreatorSelect, onDomainSelect }: AttestationCardProps) {
  const meta = attestation.metadata;
  const domainColor = getDomainColor(meta?.domain);
  const hasMetadata = meta?.metadataStatus === 'ready' && meta?.title;
  const price = attestation.priceUsdMicros ?? 0;
  const isPaid = price > 0;
  const priceLabel = isPaid ? `$${(price / 1_000_000).toFixed(2)}` : '무료';
  const shortCreator = attestation.creator
    ? `${attestation.creator.slice(0, 6)}…${attestation.creator.slice(-4)}`
    : '';
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
  const attestationTxHash = isEvmTxHash(attestation.txHash) ? attestation.txHash : null;

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
          {/* 무료 데이터: 무료공개 배지 */}
          {!isPaid && (
            <span className="attestation-card__badge attestation-card__badge--free">무료공개</span>
          )}
          {/* 유료 + 구매 완료: 작은 구매됨 표시 */}
          {isPaid && isPurchased && (
            <span className="attestation-card__badge attestation-card__badge--purchased-sm">구매됨</span>
          )}
          {meta?.metadataStatus === 'pending' && (
            <span className="attestation-card__badge attestation-card__badge--pending">분석 중</span>
          )}
          {meta?.metadataStatus === 'failed' && (
            <span className="attestation-card__badge attestation-card__badge--failed">분석 실패</span>
          )}
        </div>
      </div>

      {/* Domain + ProblemType + Creator */}
      <div className="attestation-card__meta-row">
        {meta?.domain && (
          <span
            className="attestation-card__domain"
            style={{ color: domainColor.text, background: domainColor.bg, borderColor: domainColor.border, cursor: onDomainSelect ? 'pointer' : 'default' }}
            onClick={(e) => { if (onDomainSelect && meta.domain) { e.stopPropagation(); onDomainSelect(meta.domain); } }}
            title={onDomainSelect ? '이 도메인으로 필터' : undefined}
          >
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
        {attestation.creator && (
          <button
            className="attestation-card__creator"
            onClick={(e) => { if (onCreatorSelect) { e.stopPropagation(); onCreatorSelect(attestation.creator); } }}
            title={onCreatorSelect ? '이 작성자의 데이터 보기' : attestation.creator}
            disabled={!onCreatorSelect}
          >
            <Wallet size={10} /> {shortCreator}
          </button>
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
          <span className={`attestation-card__price ${isPaid ? '' : 'attestation-card__price--free'}`}>
            {priceLabel}
          </span>
          {attestationTxHash && (
            <a
              href={basescanTxUrl(attestationTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="attestation-card__tx-link"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} /> Tx
            </a>
          )}
          <button
            className={`attestation-card__action ${isPaid && !isPurchased ? '' : 'attestation-card__action--secondary'}`}
            onClick={(e) => { e.stopPropagation(); onSelect(attestation.attestationId); }}
          >
            <FileSearch size={13} /> {isPaid && !isPurchased ? '구매하기' : '조회'}
          </button>
        </div>
      </div>
    </div>
  );
}
