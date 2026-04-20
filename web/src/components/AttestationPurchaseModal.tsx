import { useState, useEffect, useCallback } from 'react';
import { X, DollarSign, Copy, Check, Loader, AlertCircle, ShieldCheck } from 'lucide-react';
import { api, PaymentRequiredError } from '../lib/api';

interface AttestationPurchaseModalProps {
  open: boolean;
  attestationId: string | null;
  attestation?: {
    contentHash: string;
    creator: string;
    aiModel: string;
  };
  onClose: () => void;
}

interface PricingInfo {
  amountUsdMicros: number;
  amountUsd: string;
  currency: string;
}

interface DetailData {
  attestationId: string;
  originalData: unknown;
  metadata: Record<string, unknown>;
  receipt?: { receiptId: string };
}

type ModalState =
  | { step: 'loading' }
  | { step: 'pricing'; price: PricingInfo; isFree: boolean }
  | { step: 'purchasing' }
  | { step: 'success'; data: DetailData }
  | { step: 'insufficient'; error: PaymentRequiredError }
  | { step: 'error'; message: string };

export function AttestationPurchaseModal({
  open,
  attestationId,
  attestation,
  onClose,
}: AttestationPurchaseModalProps) {
  const [state, setState] = useState<ModalState>({ step: 'loading' });
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);

  // 가격 조회
  useEffect(() => {
    if (!open || !attestationId) return;
    setState({ step: 'loading' });

    api
      .get<{ pricing: PricingInfo | null }>(`/pricing/${attestationId}`)
      .then((res) => {
        const price = res.pricing || { amountUsdMicros: 0, amountUsd: '0', currency: 'USDC' };
        setState({
          step: 'pricing',
          price,
          isFree: price.amountUsdMicros === 0,
        });
      })
      .catch(() => {
        // 가격 정책 없으면 무료로 간주
        setState({
          step: 'pricing',
          price: { amountUsdMicros: 0, amountUsd: '0', currency: 'USDC' },
          isFree: true,
        });
      });
  }, [open, attestationId]);

  // 구매/조회 실행
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
        setState({ step: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
  }, [attestationId]);

  // 데이터 복사
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

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: '90vw' }}
      >
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} />
            데이터 상세 조회
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Attestation Info */}
        {attestation && (
          <div className="card mb-16" style={{ background: 'var(--bg-elevated)', padding: 12 }}>
            <div className="text-xs text-muted mb-4">Attestation</div>
            <div className="font-mono text-xs" style={{ wordBreak: 'break-all' }}>
              {attestationId}
            </div>
            <div className="flex gap-8 mt-8">
              <span className="badge badge-info">{attestation.aiModel}</span>
              <span className="text-xs text-muted">by {attestation.creator?.slice(0, 10)}...</span>
            </div>
          </div>
        )}

        {/* States */}
        {state.step === 'loading' && (
          <div className="flex items-center justify-center" style={{ padding: 40 }}>
            <Loader size={20} className="spin" />
            <span className="text-muted ml-8">가격 조회 중...</span>
          </div>
        )}

        {state.step === 'pricing' && (
          <div>
            <div className="card mb-16" style={{ padding: 16, textAlign: 'center' }}>
              <DollarSign size={24} style={{ color: 'var(--accent)' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 8 }}>
                {state.isFree ? '무료' : `$${state.price.amountUsd} ${state.price.currency}`}
              </div>
              <div className="text-xs text-muted mt-4">
                {state.isFree
                  ? '이 데이터는 무료로 열람 가능합니다.'
                  : 'Smart Wallet에서 자동 결제됩니다.'}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handlePurchase}
              style={{ width: '100%' }}
            >
              {state.isFree ? '📄 데이터 조회' : `🔒 구매 및 조회 ($${state.price.amountUsd})`}
            </button>
          </div>
        )}

        {state.step === 'purchasing' && (
          <div className="flex items-center justify-center" style={{ padding: 40 }}>
            <Loader size={20} className="spin" />
            <span className="text-muted ml-8">데이터 조회 및 결제 처리 중...</span>
          </div>
        )}

        {state.step === 'success' && (
          <div>
            <div className="flex items-center gap-8 mb-12" style={{ color: 'var(--success)' }}>
              <Check size={18} />
              <span style={{ fontWeight: 600 }}>조회 성공</span>
            </div>
            {state.data.receipt && (
              <div className="text-xs text-muted mb-8">
                Receipt: {state.data.receipt.receiptId}
              </div>
            )}
            <div
              className="card"
              style={{
                padding: 12,
                maxHeight: 300,
                overflow: 'auto',
                background: 'var(--bg-elevated)',
              }}
            >
              <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {typeof state.data.originalData === 'string'
                  ? state.data.originalData
                  : JSON.stringify(state.data.originalData, null, 2)}
              </pre>
            </div>
            <button
              className="btn btn-secondary mt-12"
              onClick={() => copyData(state.data.originalData)}
              style={{ width: '100%' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '복사됨!' : '클립보드에 복사'}
            </button>
          </div>
        )}

        {state.step === 'insufficient' && (
          <div>
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
            <button
              className="btn btn-primary"
              onClick={handlePurchase}
              style={{ width: '100%' }}
            >
              다시 시도
            </button>
          </div>
        )}

        {state.step === 'error' && (
          <div>
            <div className="flex items-center gap-8 mb-12" style={{ color: 'var(--error)' }}>
              <AlertCircle size={18} />
              <span style={{ fontWeight: 600 }}>오류 발생</span>
            </div>
            <p className="text-sm">{state.message}</p>
            <button
              className="btn btn-secondary mt-12"
              onClick={onClose}
              style={{ width: '100%' }}
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
