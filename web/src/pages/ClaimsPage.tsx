import { useState, useEffect, useCallback } from 'react';
import {
  Coins, RefreshCw, Loader, ArrowUpRight, ExternalLink,
  AlertTriangle, CheckCircle2, Wallet, Copy, Check,
} from 'lucide-react';
import { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { baseSepolia } from 'wagmi/chains';
import { api, ApiError } from '../lib/api';
import { VAULT_ADDRESS, CLAIM_ABI, USDC_DECIMALS } from '../config/wagmi';

interface ClaimStatus {
  creator: string | null;
  isWebUser: boolean;
  chainId: number;
  vaultAddress: string;
  usdcAddress: string;
  db: {
    grossEarnedUsdMicros: string;
    reconciledDepositedUsdMicros: string;
    unit: string;
    paymentCount: number;
    latestVaultTxHash: string | null;
    latestPaymentAt: string | null;
  };
  onchain: {
    claimableBaseUnits: string | null;
    unit: string;
    available: boolean;
  };
  reconciled: boolean;
  warnings: string[];
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; txHash: string }
  | { kind: 'error'; message: string };

const BASESCAN = 'https://sepolia.basescan.org';

/** 6-decimal base units(string) → 사람이 읽는 USDC 문자열 */
function formatUsdc(baseUnits: string | null): string {
  if (baseUnits === null) return '—';
  try {
    return formatUnits(BigInt(baseUnits), USDC_DECIMALS);
  } catch {
    return '—';
  }
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ClaimsPage() {
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const [addrCopied, setAddrCopied] = useState(false);

  // EOA 직접 서명 경로용 wagmi 훅 (웹/CDP 경로는 백엔드가 실행하므로 미사용)
  const { address: connected, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: eoaTxHash, writeContract, isPending: isSigning } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: eoaTxHash });

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<ClaimStatus>('/claims/me');
      setStatus(data);
      // recipient 기본값: creator 본인 주소 (한 번만 채움)
      setRecipient((prev) => prev || data.creator || '');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '수익 정보를 불러오지 못했습니다.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // EOA 경로: 트랜잭션 확정 후 잔액 갱신
  useEffect(() => {
    if (isConfirmed && eoaTxHash) {
      setAction({ kind: 'success', txHash: eoaTxHash });
      setAmount('');
      loadStatus();
    }
  }, [isConfirmed, eoaTxHash, loadStatus]);

  const claimableBase = status?.onchain.claimableBaseUnits
    ? BigInt(status.onchain.claimableBaseUnits)
    : null;

  /** 입력 amount(human USDC) → base units. 유효하지 않으면 null */
  function parseAmount(): bigint | null {
    if (!amount.trim()) return null;
    try {
      const v = parseUnits(amount.trim(), USDC_DECIMALS);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }

  const amountBase = parseAmount();
  const amountValid =
    amountBase !== null && claimableBase !== null && amountBase <= claimableBase;
  const recipientValid = /^0x[0-9a-fA-F]{40}$/.test(recipient.trim());

  // EOA 경로 상태
  const onWrongNetwork = isConnected && chain?.id !== baseSepolia.id;
  const walletMismatch =
    isConnected && !!status?.creator &&
    connected?.toLowerCase() !== status.creator.toLowerCase();

  const handleSetMax = () => {
    if (claimableBase !== null) setAmount(formatUnits(claimableBase, USDC_DECIMALS));
  };

  const copyCreator = () => {
    if (status?.creator) {
      navigator.clipboard.writeText(status.creator);
      setAddrCopied(true);
      setTimeout(() => setAddrCopied(false), 2000);
    }
  };

  // ── 웹/CDP 경로: 백엔드가 본인 smart wallet UserOp 실행 ──
  const handleClaimWeb = async () => {
    if (!amountBase || !amountValid) return;
    setAction({ kind: 'submitting' });
    try {
      const res = await api.post<{ txHash: string }>('/claims/execute', {
        amount: amountBase.toString(),
        to: recipient.trim(),
      });
      setAction({ kind: 'success', txHash: res.txHash });
      setAmount('');
      await loadStatus();
    } catch (err) {
      setAction({
        kind: 'error',
        message: err instanceof ApiError ? err.message : 'Claim에 실패했습니다.',
      });
    }
  };

  // ── EOA 경로: 본인 지갑이 직접 claimCreatorBalance 서명 ──
  const handleClaimEoa = async () => {
    if (!amountBase || !amountValid || !recipientValid) return;
    setAction({ kind: 'idle' });
    try {
      if (chain?.id !== baseSepolia.id) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      writeContract({
        chainId: baseSepolia.id,
        address: VAULT_ADDRESS,
        abi: CLAIM_ABI,
        functionName: 'claimCreatorBalance',
        args: [amountBase, recipient.trim() as `0x${string}`],
      });
    } catch (err) {
      setAction({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Claim 트랜잭션에 실패했습니다.',
      });
    }
  };

  // ── 렌더 ──
  if (loading) {
    return (
      <>
        <PageHeader />
        <div className="card flex items-center gap-8" style={{ padding: 24 }}>
          <Loader size={16} className="spin" />
          <span className="text-muted text-sm">수익 정보 로딩 중...</span>
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader />
        <div className="card" style={{ padding: 24 }}>
          <p className="text-sm" style={{ color: 'var(--danger, #e5484d)' }}>{loadError}</p>
          <button className="btn btn-secondary btn-sm mt-12" onClick={loadStatus}>
            <RefreshCw size={14} /> 다시 시도
          </button>
        </div>
      </>
    );
  }

  if (!status) return <PageHeader />;

  const noCreator = !status.creator;
  const onchainUnavailable = !status.onchain.available;
  const zeroBalance = status.onchain.available && claimableBase === 0n;
  const isWeb = status.isWebUser;
  const isBusy = action.kind === 'submitting' || isSigning || isConfirming;

  // claim 버튼 활성 조건
  const canClaim = isWeb
    ? amountValid && recipientValid && !isBusy
    : amountValid && recipientValid && isConnected && !onWrongNetwork && !walletMismatch && !isBusy;

  return (
    <>
      <PageHeader />

      {/* ═══ 요약: gross(DB) ↔ claimable(on-chain) — 별개 값 ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">평생 수익 (기록)</span></div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
            ${formatUsdc(status.db.grossEarnedUsdMicros)}
          </div>
          <p className="text-xs text-muted mt-8">
            결제 {status.db.paymentCount}건 누적 · DB 기록 기준 (claim 가능액과 별개)
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">지금 claim 가능 (on-chain)</span>
            <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }} onClick={loadStatus}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>
            {onchainUnavailable ? '—' : `$${formatUsdc(status.onchain.claimableBaseUnits)}`}
          </div>
          <p className="text-xs text-muted mt-8">
            Vault 잔액 · 부분 claim·기claim·정산지연으로 평생 수익과 다를 수 있음
          </p>
        </div>
      </div>

      {/* ═══ 경고 배너 ═══ */}
      {onchainUnavailable && (
        <div className="card mb-16" style={{ borderColor: 'var(--warning, #f5a623)' }}>
          <div className="flex items-center gap-8">
            <AlertTriangle size={16} style={{ color: 'var(--warning, #f5a623)' }} />
            <span className="text-sm">on-chain 잔액을 일시적으로 조회할 수 없습니다. 잠시 후 새로고침하세요.</span>
          </div>
        </div>
      )}
      {status.warnings.includes('onchain_exceeds_db_reconciled') && (
        <div className="card mb-16">
          <p className="text-xs text-muted">
            ℹ️ on-chain claim 가능액이 DB 정산 기록보다 큽니다. 백그라운드 정산이 곧 따라잡습니다.
          </p>
        </div>
      )}

      {/* ═══ Claim 영역 ═══ */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Coins size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} /> 출금 (Claim)</span>
        </div>

        {noCreator ? (
          <p className="text-sm text-muted" style={{ padding: '8px 0' }}>
            아직 creator 수익이 없습니다. Settings에서 Smart Wallet을 생성하고 attestation에 가격을 설정하면 수익이 쌓입니다.
          </p>
        ) : onchainUnavailable ? (
          <p className="text-sm text-muted" style={{ padding: '8px 0' }}>
            on-chain 잔액을 조회한 뒤 claim할 수 있습니다. 위에서 새로고침해 주세요.
          </p>
        ) : zeroBalance ? (
          <p className="text-sm text-muted" style={{ padding: '8px 0' }}>
            현재 claim 가능한 잔액이 없습니다. (이미 출금했거나 정산 대기 중일 수 있습니다.)
          </p>
        ) : (
          <>
            {/* creator / chain / wallet 정보 */}
            <div className="form-group">
              <label className="label">Creator 주소</label>
              <div className="flex items-center gap-8">
                <input className="input font-mono" value={status.creator ?? ''} readOnly style={{ flex: 1, fontSize: '0.8rem' }} />
                <button className="btn btn-secondary btn-sm" onClick={copyCreator}>
                  {addrCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-xs text-muted mt-8">
                {isWeb
                  ? 'ProofWeave Smart Wallet에서 자동 출금됩니다 (지갑 연결 불필요).'
                  : 'Base Sepolia에서 이 주소(연결된 지갑)로 직접 서명합니다.'}
              </p>
            </div>

            {/* EOA 경로: 지갑 연결/네트워크/불일치 가드 */}
            {!isWeb && !isConnected && (
              <div className="form-group">
                <div className="flex gap-8 flex-wrap">
                  {connectors.map((c) => (
                    <button key={c.uid} className="btn btn-primary" onClick={() => connect({ connector: c })}>
                      <Wallet size={14} /> {c.name} 연결
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isWeb && onWrongNetwork && (
              <div className="form-group">
                <button className="btn btn-secondary" onClick={() => switchChainAsync({ chainId: baseSepolia.id })}>
                  Base Sepolia로 전환
                </button>
              </div>
            )}
            {!isWeb && walletMismatch && (
              <div className="card mb-16" style={{ borderColor: 'var(--danger, #e5484d)' }}>
                <div className="flex items-center gap-8">
                  <AlertTriangle size={16} style={{ color: 'var(--danger, #e5484d)' }} />
                  <span className="text-sm">
                    연결된 지갑({truncate(connected ?? '')})이 수익 소유자({truncate(status.creator ?? '')})와 다릅니다. creator 지갑을 연결하세요.
                  </span>
                </div>
              </div>
            )}

            {/* 금액 입력 */}
            <div className="form-group">
              <label className="label">출금 금액 (USDC)</label>
              <div className="flex items-center gap-8">
                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary btn-sm" onClick={handleSetMax} type="button">MAX</button>
              </div>
              {amount.trim() !== '' && !amountValid && (
                <p className="text-xs mt-8" style={{ color: 'var(--danger, #e5484d)' }}>
                  0보다 크고 claim 가능액(${formatUsdc(status.onchain.claimableBaseUnits)}) 이하로 입력하세요.
                </p>
              )}
            </div>

            {/* 수령 주소 */}
            <div className="form-group">
              <label className="label">받는 주소</label>
              <input
                className="input font-mono"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                style={{ fontSize: '0.8rem' }}
              />
              {recipient.trim() !== '' && !recipientValid && (
                <p className="text-xs mt-8" style={{ color: 'var(--danger, #e5484d)' }}>유효한 주소를 입력하세요.</p>
              )}
            </div>

            {/* Claim 버튼 */}
            <button
              className="btn btn-primary"
              disabled={!canClaim}
              onClick={isWeb ? handleClaimWeb : handleClaimEoa}
            >
              {action.kind === 'submitting' ? (
                <><Loader size={14} className="spin" /> 처리 중...</>
              ) : isSigning ? (
                <><Loader size={14} className="spin" /> 지갑에서 승인...</>
              ) : isConfirming ? (
                <><Loader size={14} className="spin" /> 확인 중...</>
              ) : (
                <><ArrowUpRight size={14} /> Claim</>
              )}
            </button>

            {/* 결과 */}
            {action.kind === 'success' && (
              <div className="flex items-center gap-8 mt-12" style={{ color: 'var(--success, #30a46c)' }}>
                <CheckCircle2 size={16} />
                <span className="text-sm">Claim 완료</span>
                <a
                  href={`${BASESCAN}/tx/${action.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ textDecoration: 'none', padding: '2px 8px' }}
                >
                  <ExternalLink size={12} /> BaseScan
                </a>
              </div>
            )}
            {action.kind === 'error' && (
              <p className="text-sm mt-12" style={{ color: 'var(--danger, #e5484d)' }}>{action.message}</p>
            )}
          </>
        )}
      </div>

      {/* ═══ 메타 정보 ═══ */}
      <div className="card mt-16">
        <div className="flex items-center gap-8" style={{ flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <span className="text-muted">Vault</span>
          <span className="font-mono">{truncate(status.vaultAddress)}</span>
          <span className="text-muted">· 네트워크</span>
          <span>Base Sepolia ({status.chainId})</span>
          {status.db.latestVaultTxHash && (
            <>
              <span className="text-muted">· 최근 정산</span>
              <a
                href={`${BASESCAN}/tx/${status.db.latestVaultTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {truncate(status.db.latestVaultTxHash)} <ExternalLink size={11} />
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PageHeader() {
  return (
    <div className="page-header">
      <h2>Earnings</h2>
      <p>creator 수익 확인 및 Vault 출금</p>
    </div>
  );
}
