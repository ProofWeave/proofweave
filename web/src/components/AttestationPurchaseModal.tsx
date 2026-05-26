import { useState, useEffect, useCallback } from 'react';
import {
  X, DollarSign, Copy, Check, Loader, AlertCircle, ShieldCheck,
  Globe, Cpu, ExternalLink, FileText, Code, Tag,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { api, ApiError, PaymentRequiredError } from '../lib/api';
import { getReceipt } from '../lib/receiptStore';
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
  txHash?: string;
}

interface ReputationSummary {
  attestationId: string;
  verifiedUsefulRatio: number | null;
  verifiedSampleSize: number;
  unverifiedUsefulRatio: number | null;
  unverifiedSampleSize: number;
  earlyEvaluationStage: boolean;
}

interface ReputationLog {
  id: string;
  attestationId: string;
  accountAddress: string;
  receiptId: string | null;
  rating: 'useful' | 'not_useful';
  note: string | null;
  artifactHash: string | null;
  trustTier: 'verified' | 'unverified';
  createdAt: string;
}

interface ReputationSubmissionResponse {
  reputation: ReputationLog;
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
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [dataViewMode, setDataViewMode] = useState<DataViewMode>('markdown');
  const [pricingCache, setPricingCache] = useState<PricingInfo | null>(null);
  const [accessReceipt, setAccessReceipt] = useState<string | null>(null);
  const [reputationSummary, setReputationSummary] = useState<ReputationSummary | null>(null);
  const [reputationSummaryLoading, setReputationSummaryLoading] = useState(false);
  const [reputationRating, setReputationRating] = useState<'useful' | 'not_useful' | null>(null);
  const [reputationNote, setReputationNote] = useState('');
  const [reputationArtifactHash, setReputationArtifactHash] = useState('');
  const [reputationSubmitting, setReputationSubmitting] = useState(false);
  const [reputationFeedback, setReputationFeedback] = useState<{ kind: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [submittedReputation, setSubmittedReputation] = useState<ReputationLog | null>(null);

  const modalRef = useModalRef();
  useModalKeyboard({ open, onClose, containerRef: modalRef });

  const meta = attestation?.metadata;
  const hasMetadata = meta?.metadataStatus === 'ready' && meta?.title;

  const formatRatio = (ratio: number | null) => {
    if (ratio === null) return '—';
    return `${Math.round(ratio * 100)}%`;
  };

  const formatReceipt = (value: string | null) => {
    if (!value) return '—';
    return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  };

  const settlementStage = state.step === 'success'
    ? 3
    : state.step === 'purchasing'
      ? 1
      : state.step === 'pricing'
        ? 0
        : -1;

  const loadReputationSummary = useCallback(async (id: string) => {
    setReputationSummaryLoading(true);
    try {
      const summary = await api.get<ReputationSummary>(`/attestations/${id}/reputation`);
      setReputationSummary(summary);
    } catch {
      setReputationSummary(null);
    } finally {
      setReputationSummaryLoading(false);
    }
  }, []);

  const hydrateSuccessState = useCallback((id: string, data: DetailData) => {
    setState({ step: 'success', data });
    setAccessReceipt(getReceipt(id));
    setReputationArtifactHash((prev) => prev || data.contentHash || attestation?.contentHash || '');
    void loadReputationSummary(id);
  }, [attestation?.contentHash, loadReputationSummary]);

  const submitReputation = useCallback(async () => {
    if (!attestationId || !reputationRating) return;

    setReputationSubmitting(true);
    setReputationFeedback(null);

    try {
      const payload = {
        rating: reputationRating,
        note: reputationNote.trim() || undefined,
        artifactHash: reputationArtifactHash.trim() || undefined,
      };
      const res = await api.post<ReputationSubmissionResponse>(`/attestations/${attestationId}/reputation`, payload);
      setSubmittedReputation(res.reputation);
      setReputationFeedback({
        kind: 'success',
        message: res.reputation.trustTier === 'verified'
          ? '평가가 저장되고 receipt로 검증되었습니다.'
          : '평가가 저장되었습니다.',
      });
      void loadReputationSummary(attestationId);
    } catch (err) {
      if (err instanceof ApiError) {
        const messageByStatus: Record<number, string> = {
          400: '평가 내용을 확인해 주세요.',
          403: '구매 후에만 평가할 수 있습니다.',
          409: '이미 평가했습니다.',
        };
        setReputationFeedback({
          kind: 'error',
          message: messageByStatus[err.status] || err.message,
        });
      } else {
        setReputationFeedback({
          kind: 'error',
          message: err instanceof Error ? err.message : '평가 제출에 실패했습니다.',
        });
      }
    } finally {
      setReputationSubmitting(false);
    }
  }, [attestationId, loadReputationSummary, reputationArtifactHash, reputationNote, reputationRating]);

  useEffect(() => {
    if (!open || !attestationId) return;
    setDataViewMode('markdown');
    setCopied(false);
    setReceiptCopied(false);
    setWalletCopied(false);
    setAccessReceipt(null);
    setReputationSummary(null);
    setReputationSummaryLoading(false);
    setReputationRating(null);
    setReputationNote('');
    setReputationArtifactHash('');
    setReputationSubmitting(false);
    setReputationFeedback(null);
    setSubmittedReputation(null);

    if (alreadyPurchased) {
      // 이미 구매 → 바로 detail 호출
      setState({ step: 'purchasing' });
      api.get<DetailData>(`/attestations/${attestationId}/detail`)
        .then((data) => hydrateSuccessState(attestationId, data))
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
  }, [alreadyPurchased, attestationId, hydrateSuccessState, open]);

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

  const handlePurchase = useCallback(async () => {
    if (!attestationId) return;
    setState({ step: 'purchasing' });

    try {
      const data = await api.get<DetailData>(`/attestations/${attestationId}/detail`);
      hydrateSuccessState(attestationId, data);
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        setState({ step: 'insufficient', error: err });
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setState({ step: 'error', message: msg });
      }
    }
  }, [attestationId, hydrateSuccessState]);

  const handleViewDetail = useCallback(() => {
    if (pricingCache && pricingCache.amountUsdMicros > 0) {
      setState({ step: 'pricing', price: pricingCache, isFree: false });
    } else {
      handlePurchase();
    }
  }, [handlePurchase, pricingCache]);

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

  const copyReceipt = useCallback((receipt: string) => {
    navigator.clipboard.writeText(receipt);
    setReceiptCopied(true);
    setTimeout(() => setReceiptCopied(false), 2000);
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
  const settlementSteps = [
    {
      label: 'Initiated',
      detail: '조회 요청을 시작합니다.',
    },
    {
      label: 'UserOp signed',
      detail: '결제 서명과 지갑 승인을 처리합니다.',
    },
    {
      label: 'Onchain confirmed',
      detail: '체인 상 결제가 확인됩니다.',
    },
    {
      label: 'API reconciled',
      detail: '상세 데이터가 해제됩니다.',
    },
  ];

  const effectiveTxHash = state.step === 'success'
    ? (state.data.txHash || attestation?.txHash)
    : attestation?.txHash;

  const activeReceipt = accessReceipt;

  const currentSettlementLabel = settlementStage === 3
    ? '정산 완료'
    : settlementStage === 1
      ? '처리 중'
      : settlementStage === 0
        ? '대기'
        : '미진행';

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
            <div className="detail-settlement mb-16">
              <div className="detail-settlement__header">
                <div>
                  <div className="detail-settlement__eyebrow">Settlement rail</div>
                  <div className="detail-settlement__title">결제 상태 · {currentSettlementLabel}</div>
                </div>
                <div className="detail-settlement__note">x402 흐름을 단계별로 보여줍니다.</div>
              </div>
              <div className="detail-settlement__steps">
                {settlementSteps.map((step, index) => {
                  const status = index < settlementStage ? 'done' : index === settlementStage ? 'active' : 'pending';
                  return (
                    <div key={step.label} className={`detail-settlement__step detail-settlement__step--${status}`}>
                      <div className="detail-settlement__step-index">{index + 1}</div>
                      <div className="detail-settlement__step-body">
                        <div className="detail-settlement__step-label">{step.label}</div>
                        <div className="detail-settlement__step-detail">{step.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
          <div style={{ padding: '20px 0' }}>
            <div className="detail-settlement mb-16">
              <div className="detail-settlement__header">
                <div>
                  <div className="detail-settlement__eyebrow">Settlement rail</div>
                  <div className="detail-settlement__title">결제 상태 · {currentSettlementLabel}</div>
                </div>
                <div className="detail-settlement__note">백엔드가 동기식으로 처리해도 단계는 그대로 노출됩니다.</div>
              </div>
              <div className="detail-settlement__steps">
                {settlementSteps.map((step, index) => {
                  const status = index < settlementStage ? 'done' : index === settlementStage ? 'active' : 'pending';
                  return (
                    <div key={step.label} className={`detail-settlement__step detail-settlement__step--${status}`}>
                      <div className="detail-settlement__step-index">{index + 1}</div>
                      <div className="detail-settlement__step-body">
                        <div className="detail-settlement__step-label">{step.label}</div>
                        <div className="detail-settlement__step-detail">{step.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-center" style={{ padding: 24 }}>
              <Loader size={20} className="spin" />
              <span className="text-muted ml-8">
                {alreadyPurchased ? '데이터 불러오는 중...' : '조회 및 결제 처리 중...'}
              </span>
            </div>
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

            <div className="detail-settlement mb-16">
              <div className="detail-settlement__header">
                <div>
                  <div className="detail-settlement__eyebrow">Settlement rail</div>
                  <div className="detail-settlement__title">정산 완료 · {currentSettlementLabel}</div>
                </div>
                <div className="detail-settlement__note">요청, 체인 확인, API 반영이 모두 끝났습니다.</div>
              </div>
              <div className="detail-settlement__steps">
                {settlementSteps.map((step, index) => (
                  <div key={step.label} className="detail-settlement__step detail-settlement__step--done">
                    <div className="detail-settlement__step-index">{index + 1}</div>
                    <div className="detail-settlement__step-body">
                      <div className="detail-settlement__step-label">{step.label}</div>
                      <div className="detail-settlement__step-detail">{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-data__receipt-row">
              <div className="detail-data__receipt-copy">
                <span className="detail-data__receipt-label">Stored receipt</span>
                <code className="detail-data__receipt-value">{formatReceipt(activeReceipt)}</code>
              </div>
              {activeReceipt && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyReceipt(activeReceipt)}
                >
                  {receiptCopied ? <Check size={13} /> : <Copy size={13} />}
                  {receiptCopied ? '복사됨' : '복사'}
                </button>
              )}
              {effectiveTxHash && (
                <a
                  href={`https://sepolia.basescan.org/tx/${effectiveTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <ExternalLink size={13} /> Basescan
                </a>
              )}
            </div>

            <div className="detail-reputation">
              <div className="detail-reputation__header">
                <div>
                  <div className="detail-reputation__eyebrow">Reputation</div>
                  <div className="detail-reputation__title">커뮤니티 평가</div>
                </div>
                <div className="detail-reputation__meta">
                  {reputationSummaryLoading ? '불러오는 중…' : '공개 집계 + 제출 폼'}
                </div>
              </div>

              {reputationSummary && (
                <div className="detail-reputation__summary">
                  <div className="detail-reputation__stat">
                    <span className="detail-reputation__stat-label">Verified useful</span>
                    <span className="detail-reputation__stat-value">{formatRatio(reputationSummary.verifiedUsefulRatio)}</span>
                    <span className="detail-reputation__stat-footnote">
                      {reputationSummary.verifiedSampleSize} samples
                    </span>
                  </div>
                  <div className="detail-reputation__stat">
                    <span className="detail-reputation__stat-label">Unverified useful</span>
                    <span className="detail-reputation__stat-value">{formatRatio(reputationSummary.unverifiedUsefulRatio)}</span>
                    <span className="detail-reputation__stat-footnote">
                      {reputationSummary.unverifiedSampleSize} samples
                    </span>
                  </div>
                  <div className="detail-reputation__stat detail-reputation__stat--flag">
                    <span className="detail-reputation__stat-label">Stage</span>
                    <span className="detail-reputation__stat-value">
                      {reputationSummary.earlyEvaluationStage ? 'Early' : 'Stable'}
                    </span>
                    <span className="detail-reputation__stat-footnote">
                      {reputationSummary.earlyEvaluationStage ? '평가 데이터가 아직 적습니다.' : '평가가 충분히 쌓였습니다.'}
                    </span>
                  </div>
                </div>
              )}

              <div className="detail-reputation__form">
                <div className="detail-reputation__rating-row">
                  <button
                    className={`detail-reputation__pill ${reputationRating === 'useful' ? 'active' : ''}`}
                    onClick={() => setReputationRating('useful')}
                    disabled={reputationSubmitting}
                  >
                    useful
                  </button>
                  <button
                    className={`detail-reputation__pill ${reputationRating === 'not_useful' ? 'active' : ''}`}
                    onClick={() => setReputationRating('not_useful')}
                    disabled={reputationSubmitting}
                  >
                    not_useful
                  </button>
                </div>

                <textarea
                  className="detail-reputation__textarea"
                  value={reputationNote}
                  onChange={(e) => setReputationNote(e.target.value)}
                  placeholder="짧은 메모 (선택)"
                  maxLength={280}
                  disabled={reputationSubmitting}
                />

                <input
                  className="detail-reputation__input"
                  value={reputationArtifactHash}
                  onChange={(e) => setReputationArtifactHash(e.target.value)}
                  placeholder="artifact hash (선택)"
                  disabled={reputationSubmitting}
                />

                <button
                  className="btn btn-primary"
                  onClick={submitReputation}
                  disabled={!reputationRating || reputationSubmitting}
                >
                  {reputationSubmitting ? <Loader size={14} className="spin" /> : <Check size={14} />}
                  평가 제출
                </button>
              </div>

              {reputationFeedback && (
                <p className={`detail-reputation__message detail-reputation__message--${reputationFeedback.kind}`}>
                  {reputationFeedback.message}
                </p>
              )}

              {submittedReputation && (
                <div className="detail-reputation__submitted">
                  <div className="detail-reputation__submitted-line">
                    <span className="detail-reputation__submitted-rating">{submittedReputation.rating}</span>
                    <span className="detail-reputation__submitted-tier">{submittedReputation.trustTier}</span>
                  </div>
                  <div className="detail-reputation__submitted-meta">
                    Receipt {formatReceipt(submittedReputation.receiptId)}
                  </div>
                </div>
              )}
            </div>

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
