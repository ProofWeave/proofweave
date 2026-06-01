import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Key, Wallet, RefreshCw, Link2, Unlink, ArrowUpRight, Loader, Plus, AlertCircle } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { baseSepolia } from 'wagmi/chains';
import { useAuth } from '../contexts/auth-core';
import { api } from '../lib/api';
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_TRANSFER_ABI } from '../config/wagmi';

interface SmartWalletData {
  address: string;
  ownerAddress: string;
  balanceUsdMicros: number;
}

export function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [walletLoading, setWalletLoading] = useState(true);
  const [smartWallet, setSmartWallet] = useState<SmartWalletData | null>(null);
  const [chargeAmount, setChargeAmount] = useState('1');
  const [chargeStatus, setChargeStatus] = useState<'idle' | 'confirming' | 'done' | 'error'>('idle');
  const [creating, setCreating] = useState(false);
  const apiKey = api.getApiKey();

  // wagmi hooks
  const { address: externalAddress, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: txHash, writeContract, isPending: isSending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Smart Wallet 정보 로드
  useEffect(() => {
    if (!apiKey) {
      setWalletLoading(false);
      return;
    }
    loadWalletInfo();
  }, [apiKey]);

  // 트랜잭션 확인 후 잔고 갱신
  useEffect(() => {
    if (isConfirming) setChargeStatus('confirming');
    if (isConfirmed) {
      setChargeStatus('done');
      loadWalletInfo();
      setTimeout(() => setChargeStatus('idle'), 3000);
    }
  }, [isConfirming, isConfirmed]);

  const loadWalletInfo = async () => {
    setWalletLoading(true);
    try {
      const [addrRes, balRes] = await Promise.all([
        api.get<{ smartWalletAddress: string | null }>('/wallet/address').catch(() => ({ smartWalletAddress: null })),
        api.get<{ balanceUsdMicros: number; ownerAddress?: string }>('/wallet/balance').catch(() => null),
      ]);

      if (addrRes.smartWalletAddress) {
        setSmartWallet({
          address: addrRes.smartWalletAddress,
          ownerAddress: balRes?.ownerAddress || '',
          balanceUsdMicros: balRes?.balanceUsdMicros || 0,
        });
      } else {
        setSmartWallet(null);
      }
    } catch {
      setSmartWallet(null);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleCreateWallet = async () => {
    setCreating(true);
    try {
      await api.post<{ smartWalletAddress: string }>('/wallet/create', {});
      await loadWalletInfo();
    } catch (err) {
      console.error('Smart wallet creation failed:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleCharge = async () => {
    if (!smartWallet?.address || !chargeAmount) return;
    const amount = parseFloat(chargeAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      // Base Sepolia로 체인 전환 (다른 체인 연결 시)
      await switchChainAsync({ chainId: baseSepolia.id });
      writeContract({
        chainId: baseSepolia.id,
        address: USDC_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [smartWallet.address as `0x${string}`, parseUnits(chargeAmount, USDC_DECIMALS)],
      });
    } catch {
      setChargeStatus('error');
    }
  };

  const copyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyWalletAddress = () => {
    if (smartWallet?.address) {
      navigator.clipboard.writeText(smartWallet.address);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 2000);
    }
  };

  const formatUsd = (micros: number) => (micros / 1_000_000).toFixed(2);

  return (
    <>
      <div className="page-header">
        <h2>Settings</h2>
        <p>계정 · API · 지갑 설정 — 내 데이터와 구매 내역은 <button className="link-cyan" style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }} onClick={() => navigate('/analytics')}>Activity</button>에서 확인하세요.</p>
      </div>

      {/* ═══ Row 1: 계정정보 + Smart Wallet (2-up, content-aware) ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>

      {/* 계정 정보 */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">계정 정보</span>
        </div>
        <div className="form-group">
          <label className="label">이메일</label>
          <input className="input" value={user?.email || '—'} readOnly />
        </div>
        <div className="form-group">
          <label className="label">로그인 방식</label>
          <input className="input" value={user?.app_metadata?.provider || 'email'} readOnly />
        </div>
      </div>

      {/* Smart Wallet */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Wallet size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Smart Wallet
          </span>
          {smartWallet && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadWalletInfo}
              style={{ padding: '2px 8px' }}
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>

        {walletLoading ? (
          <div className="flex items-center gap-8" style={{ padding: '10px 0' }}>
            <RefreshCw size={14} className="spin" />
            <span className="text-muted text-sm">지갑 정보 로딩 중...</span>
          </div>
        ) : smartWallet ? (
          <>
            <div className="form-group">
              <label className="label">주소</label>
              <div className="flex items-center gap-8">
                <input
                  className="input font-mono"
                  value={smartWallet.address}
                  readOnly
                  style={{ flex: 1, fontSize: '0.8rem' }}
                />
                <button className="btn btn-secondary btn-sm" onClick={copyWalletAddress}>
                  {walletCopied ? <Check size={14} /> : <Copy size={14} />}
                  {walletCopied ? '복사됨' : '복사'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="label">USDC 잔고</label>
              <span
                className="badge badge-info"
                style={{ fontSize: '1rem', padding: '8px 16px', display: 'inline-block' }}
              >
                ${formatUsd(smartWallet.balanceUsdMicros)} USDC
              </span>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-muted mb-12">
              Smart Wallet이 아직 생성되지 않았습니다.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleCreateWallet}
              disabled={creating || !apiKey}
            >
              {creating ? (
                <><Loader size={14} className="spin" /> 생성 중...</>
              ) : (
                <><Plus size={14} /> Smart Wallet 생성</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 외부 지갑 연결 + 충전 */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Link2 size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            외부 지갑 / 충전
          </span>
        </div>

        {!isConnected ? (
          <div>
            <p className="text-sm text-muted mb-12">
              MetaMask 등 외부 지갑을 연결하여 USDC를 충전하세요.
            </p>
            <div className="flex gap-8 flex-wrap">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  className="btn btn-primary"
                  onClick={() => connect({ connector })}
                >
                  <Wallet size={14} /> {connector.name} 연결
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="form-group">
              <label className="label">연결된 주소</label>
              <div className="flex items-center gap-8">
                <input
                  className="input font-mono"
                  value={externalAddress || ''}
                  readOnly
                  style={{ flex: 1, fontSize: '0.8rem' }}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => disconnect()}>
                  <Unlink size={12} /> 해제
                </button>
              </div>
            </div>

            {smartWallet ? (
              <div className="form-group">
                <label className="label">USDC 충전</label>
                <div className="flex items-center gap-8">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                    style={{ width: 100 }}
                    placeholder="USDC"
                  />
                  <button
                    className="btn btn-primary"
                    disabled={isSending || chargeStatus === 'confirming'}
                    onClick={handleCharge}
                  >
                    {isSending ? (
                      <><Loader size={14} className="spin" /> 전송 중...</>
                    ) : chargeStatus === 'confirming' ? (
                      <><Loader size={14} className="spin" /> 확인 중...</>
                    ) : (
                      <><ArrowUpRight size={14} /> 충전</>
                    )}
                  </button>
                </div>
                {chargeStatus === 'done' && (
                  <p className="text-xs mt-8 flex items-center gap-4" style={{ color: 'var(--success)' }}>
                    <Check size={12} /> 충전 완료! 잔고가 업데이트되었습니다.
                  </p>
                )}
                {chargeStatus === 'error' && (
                  <p className="text-xs mt-8 flex items-center gap-4" style={{ color: 'var(--error)' }}>
                    <AlertCircle size={12} /> 충전에 실패했습니다. 네트워크와 잔고를 확인 후 다시 시도하세요.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">
                먼저 위에서 Smart Wallet을 생성해주세요.
              </p>
            )}
          </div>
        )}
      </div>

      </div>{/* end Row 1 */}

      {/* ═══ API Key ═══ */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header">
          <span className="card-title">
            <Key size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            API Key
          </span>
        </div>
        {apiKey ? (
          <>
            <div className="flex items-center gap-12">
              <input
                className="input font-mono"
                value={`${apiKey.slice(0, 12)}${'•'.repeat(20)}${apiKey.slice(-6)}`}
                readOnly
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary btn-sm" onClick={copyKey}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <p className="text-xs text-muted mt-8">
              SDK/CLI에서 이 키를 사용하세요. 탭을 닫으면 만료됩니다.
            </p>
          </>
        ) : (
          <p className="text-secondary text-sm">
            API Key가 없습니다. /auth/register 연동 후 자동 발급됩니다.
          </p>
        )}
      </div>
    </>
  );
}
