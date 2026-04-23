import { useState, useEffect, useCallback } from 'react';
import {
  X, DollarSign, Copy, Check, Loader, AlertCircle, ShieldCheck,
  Globe, Cpu, ExternalLink, FileText, Code, Tag,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { api, PaymentRequiredError } from '../lib/api';
import { useModalKeyboard, useModalRef } from '../hooks/useModalKeyboard';
import type { AttestationWithMetadata } from './AttestationCard';

/* ── Types ─────────────────────────────────────────────────── */

interface AttestationPurchaseModalProps {
  open: boolean;
  attestationId: string | null;
  attestation?: AttestationWithMetadata;
  onClose: () => void;
  alreadyPurchased?: boolean;
}

interface PricingInfo {
  amountUsdMicros: number;
  amountUsd: string;
  currency: string;
}

interface DetailData {
  attestationId: string;
  data: unknown;
  contentHash?: string;
  creator?: string;
  aiModel?: string;
  receipt?: { receiptId: string };
}

type ModalState =
  | { step: 'loading' }
  | { step: 'preview' }
  | { step: 'pricing'; price: PricingInfo; isFree: boolean }
  | { step: 'purchasing' }
  | { step: 'success'; data: DetailData }
  | { step: 'insufficient'; error: PaymentRequiredError }
  | { step: 'error'; message: string };

type DataViewMode = 'markdown' | 'json';

/* ── Domain labels ─────────────────────────────────────────── */

const DOMAIN_LABELS: Record<string, string> = {
  defi: 'DeFi', smart_contract: 'Smart Contract', security: 'Security',
  legal: 'Legal', data_analysis: 'Data Analysis', code_review: 'Code Review',
  explanation: 'Explanation', security_analysis: 'Security Analysis',
};

/* ── Component ─────────────────────────────────────────────── */

export function AttestationPurchaseModal({
  open,
  attestationId,
  attestation,
  onClose,
  alreadyPurchased = false,
}: AttestationPurchaseModalProps) {
  const [state, setState] = useState<ModalState>({ step: 'loading' });
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [dataViewMode, setDataViewMode] = useState<DataViewMode>('markdown');
  const [pricingCache, setPricingCache] = useState<PricingInfo | null>(null);

  const modalRef = useModalRef();
  useModalKeyboard({ open, onClose, containerRef: modalRef });

  const meta = attestation?.metadata;
  const hasMetadata = meta?.metadataStatus === 'ready' && meta?.title;

  useEffect(() => {
    if (!open || !attestationId) return;
    setDataViewMode('markdown');
    setCopied(false);

    if (alreadyPurchased) {
      // 이미 구매 → 바로 detail 호출
      setState({ step: 'purchasing' });
      api.get<DetailData>(`/attestations/${attestationId}/detail`)
        .then((data) => setState({ step: 'success', data }))
        .catch((err) => {
          if (err instanceof PaymentRequiredError) {
            fetchPricing(attestationId);
          } else {
            setState({ step: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
          }
        });
    } else {
      // 미구매 → 프리뷰 먼저 보여주고, 가격 백그라운드 조회
      setState({ step: 'preview' });
      fetchPricingBackground(attestationId);
    }
  }, [open, attestationId, alreadyPurchased]);

  const fetchPricingBackground = (id: string) => {
    api
      .get<{ priceUsdMicros: number; priceUsd: string; currency: string }>(`/pricing/${id}`)
      .then((res) => {
        setPricingCache({
          amountUsdMicros: res.priceUsdMicros,
          amountUsd: res.priceUsd,
          currency: res.currency,
        });
      })
      .catch(() => {
        setPricingCache({ amountUsdMicros: 0, amountUsd: '0', currency: 'USDC' });
      });
  };

  const fetchPricing = (id: string) => {
    setState({ step: 'loading' });
    api
      .get<{ priceUsdMicros: number; priceUsd: string; currency: string }>(`/pricing/${id}`)
      .then((res) => {
        const price: PricingInfo = {
          amountUsdMicros: res.priceUsdMicros,
          amountUsd: res.priceUsd,
          currency: res.currency,
        };
        setState({ step: 'pricing', price, isFree: price.amountUsdMicros === 0 });
      })
      .catch(() => {
        setState({
          step: 'pricing',
          price: { amountUsdMicros: 0, amountUsd: '0', currency: 'USDC' },
          isFree: true,
        });
      });
  };

  const handleViewDetail = useCallback(() => {
    if (pricingCache && pricingCache.amountUsdMicros > 0) {
      setState({ step: 'pricing', price: pricingCache, isFree: false });
    } else {
      handlePurchase();
    }
  }, [pricingCache, attestationId]);

  const handlePurchase = useCallback(async () => {
    if (!attestationId) return;
    setState({ step: 'purchasing' });

    try {
      const data = await api.get<DetailData>(`/attestations/${attestationId}/detail`);
      setState({ step: 'success', data });
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        setState({ step: 'insufficient', error: err });
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setState({ step: 'error', message: msg });
      }
    }
  }, [attestationId]);

  const copyData = useCallback((data: unknown) => {
    navigator.clipboard.writeText(
      typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const copyWallet = useCallback((address: string) => {
    navigator.clipboard.writeText(address);
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 2000);
  }, []);

  /** 데이터를 markdown 문자열로 변환 */
  const dataToMarkdown = (data: unknown): string => {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return String(data);

    const obj = data as Record<string, unknown>;
    const lines: string[] = [];

    if (obj.title || obj.result) {
      if (obj.title) lines.push(`# ${obj.title}\n`);
      if (obj.result) lines.push(`${obj.result}\n`);
    }

    // 기타 필드들
    for (const [key, value] of Object.entries(obj)) {
      if (['title', 'result'].includes(key)) continue;
      if (typeof value === 'string') {
        lines.push(`**${key}**: ${value}`);
      } else if (Array.isArray(value)) {
        lines.push(`**${key}**: ${value.join(', ')}`);
      } else if (value !== null && value !== undefined) {
        lines.push(`**${key}**: \`${JSON.stringify(value)}\``);
      }
    }

    return lines.join('\n\n');
  };

  if (!open) return null;

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

  const isFree = pricingCache ? pricingCache.amountUsdMicros === 0 : true;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} />
            {state.step === 'preview' ? '데이터 상세' : '데이터 조회'}
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Preview: Rich card detail ── */}
        {(state.step === 'preview' || state.step === 'loading') && attestation && (
          <div className="detail-preview">
            {/* Title */}
            <h2 className="detail-preview__title">
              {hasMetadata ? meta!.title : truncateHash(attestation.contentHash)}
            </h2>

            {/* Meta badges */}
            <div className="detail-preview__meta">
              {meta?.domain && (
                <span className="badge badge-purple">
                  {DOMAIN_LABELS[meta.domain] || meta.domain}
                </span>
              )}
              {meta?.problemType && (
                <span className="badge badge-info">
                  {DOMAIN_LABELS[meta.problemType] || meta.problemType}
                </span>
              )}
              {meta?.language && (
                <span className="badge badge-info">
                  <Globe size={10} /> {meta.language.toUpperCase()}
                </span>
              )}
              {alreadyPurchased && (
                <span className="badge badge-success">구매 완료</span>
              )}
            </div>

            {/* Abstract */}
            {meta?.abstract && (
              <p className="detail-preview__abstract">{meta.abstract}</p>
            )}

            {/* Keywords */}
            {meta?.keywords && meta.keywords.length > 0 && (
              <div className="detail-preview__keywords">
                <Tag size={13} style={{ color: 'var(--text-muted)' }} />
                {meta.keywords.map((kw) => (
                  <span key={kw} className="detail-preview__keyword">{kw}</span>
                ))}
              </div>
            )}

            {/* Info grid */}
            <div className="detail-preview__grid">
              <div className="detail-preview__info">
                <span className="detail-preview__info-label">Model</span>
                <span className="detail-preview__info-value">
                  <Cpu size={12} /> {attestation.aiModel}
                </span>
              </div>
              <div className="detail-preview__info">
                <span className="detail-preview__info-label">Creator</span>
                <span className="detail-preview__info-value font-mono" style={{ fontSize: '0.72rem' }}>
                  {attestation.creator?.slice(0, 12)}…
                </span>
              </div>
              {meta?.sizeStats && (
                <div className="detail-preview__info">
                  <span className="detail-preview__info-label">Tokens</span>
                  <span className="detail-preview__info-value">
                    {meta.sizeStats.inputTokens ?? 0} → {meta.sizeStats.outputTokens ?? 0}
                  </span>
                </div>
              )}
              <div className="detail-preview__info">
                <span className="detail-preview__info-label">Price</span>
                <span className="detail-preview__info-value">
                  {pricingCache
                    ? (isFree ? '무료' : `$${pricingCache.amountUsd}`)
                    : <Loader size={12} className="spin" />
                  }
                </span>
              </div>
            </div>

            {/* Attestation ID */}
            <div className="detail-preview__id">
              <span className="text-xs text-muted">Attestation ID</span>
              <code className="font-mono" style={{ fontSize: '0.68rem', wordBreak: 'break-all' }}>
                {attestationId}
              </code>
            </div>

            {/* Actions */}
            <div className="detail-preview__actions">
              <button className="btn btn-primary" onClick={handleViewDetail}>
                <FileText size={15} />
                {isFree ? '데이터 조회' : `구매 및 조회 ($${pricingCache?.amountUsd || '...'})`}
              </button>
              <a
                href={`https://sepolia.basescan.org/tx/${attestation.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                <ExternalLink size={14} /> Basescan에서 보기
              </a>
            </div>
          </div>
        )}

        {/* ── Pricing confirmation (paid) ── */}
        {state.step === 'pricing' && (
          <div style={{ padding: '20px 0' }}>
            <div className="card mb-16" style={{ padding: 16, textAlign: 'center' }}>
              <DollarSign size={24} style={{ color: 'var(--accent-purple)' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 8 }}>
                {state.isFree ? '무료' : `$${state.price.amountUsd} ${state.price.currency}`}
              </div>
              <div className="text-xs text-muted mt-4">
                {state.isFree
                  ? '이 데이터는 무료로 열람 가능합니다.'
                  : 'Smart Wallet에서 자동 결제됩니다.'}
              </div>
            </div>
            <button className="btn btn-primary" onClick={handlePurchase} style={{ width: '100%' }}>
              {state.isFree ? '📄 데이터 조회' : `🔒 구매 및 조회 ($${state.price.amountUsd})`}
            </button>
          </div>
        )}

        {/* ── Purchasing spinner ── */}
        {state.step === 'purchasing' && (
          <div className="flex items-center justify-center" style={{ padding: 40 }}>
            <Loader size={20} className="spin" />
            <span className="text-muted ml-8">
              {alreadyPurchased ? '데이터 불러오는 중...' : '조회 및 결제 처리 중...'}
            </span>
          </div>
        )}

        {/* ── Success: Data viewer with MD/JSON toggle ── */}
        {state.step === 'success' && (
          <div className="detail-data">
            <div className="detail-data__header">
              <div className="flex items-center gap-8" style={{ color: 'var(--success)' }}>
                <Check size={16} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {alreadyPurchased ? '구매 데이터' : '조회 성공'}
                </span>
              </div>

              {/* View Mode Toggle */}
              <div className="detail-data__toggle">
                <button
                  className={dataViewMode === 'markdown' ? 'active' : ''}
                  onClick={() => setDataViewMode('markdown')}
                >
                  <FileText size={13} /> MD
                </button>
                <button
                  className={dataViewMode === 'json' ? 'active' : ''}
                  onClick={() => setDataViewMode('json')}
                >
                  <Code size={13} /> JSON
                </button>
              </div>
            </div>

            {state.data.receipt && (
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                Receipt: {state.data.receipt.receiptId}
              </div>
            )}

            <div className="detail-data__content">
              {dataViewMode === 'markdown' ? (
                <div className="chat-markdown">
                  <Markdown>{dataToMarkdown(state.data.data)}</Markdown>
                </div>
              ) : (
                <pre className="detail-data__json">
                  {typeof state.data.data === 'string'
                    ? state.data.data
                    : JSON.stringify(state.data.data, null, 2)}
                </pre>
              )}
            </div>

            <button
              className="btn btn-secondary mt-12"
              onClick={() => copyData(state.data.data)}
              style={{ width: '100%' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '복사됨!' : '클립보드에 복사'}
            </button>
          </div>
        )}

        {/* ── Insufficient balance ── */}
        {state.step === 'insufficient' && (
          <div style={{ padding: '12px 0' }}>
            <div className="flex items-center gap-8 mb-12" style={{ color: 'var(--warning)' }}>
              <AlertCircle size={18} />
              <span style={{ fontWeight: 600 }}>USDC 잔고 부족</span>
            </div>
            <div className="card mb-12" style={{ padding: 12, background: 'var(--bg-elevated)' }}>
              <div className="flex justify-between mb-8">
                <span className="text-xs text-muted">필요 금액</span>
                <span className="text-sm" style={{ fontWeight: 600 }}>
                  ${state.error.price.amountUsd} USDC
                </span>
              </div>
              {state.error.smartWallet.address && (
                <>
                  <div className="text-xs text-muted mb-4">Smart Wallet 주소</div>
                  <div className="flex items-center gap-4">
                    <code className="font-mono" style={{ fontSize: '0.7rem', flex: 1, wordBreak: 'break-all' }}>
                      {state.error.smartWallet.address}
                    </code>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyWallet(state.error.smartWallet.address!)}
                      style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}
                    >
                      {walletCopied ? '복사됨' : '복사'}
                    </button>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-muted mb-12">
              위 주소로 USDC를 충전한 후 다시 시도하세요.
            </p>
            <button className="btn btn-primary" onClick={handlePurchase} style={{ width: '100%' }}>
              다시 시도
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {state.step === 'error' && (
          <div style={{ padding: '12px 0' }}>
            <div className="flex items-center gap-8 mb-12" style={{ color: 'var(--error)' }}>
              <AlertCircle size={18} />
              <span style={{ fontWeight: 600 }}>오류 발생</span>
            </div>
            <p className="text-sm">{state.message}</p>
            <button className="btn btn-secondary mt-12" onClick={onClose} style={{ width: '100%' }}>
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
