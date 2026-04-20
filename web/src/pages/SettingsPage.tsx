import { useState, useEffect } from 'react';
import { Copy, Check, Key, Wallet, RefreshCw, Link2, Unlink, ArrowUpRight, Loader } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_TRANSFER_ABI } from '../config/wagmi';

interface SmartWalletData {
  address: string;
  ownerAddress: string;
  balanceUsdMicros: number;
}

export function SettingsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [walletLoading, setWalletLoading] = useState(true);
  const [smartWallet, setSmartWallet] = useState<SmartWalletData | null>(null);
  const [chargeAmount, setChargeAmount] = useState('5');
  const [chargeStatus, setChargeStatus] = useState<'idle' | 'confirming' | 'done' | 'error'>('idle');
  const apiKey = api.getApiKey();

  // wagmi hooks
  const { address: externalAddress, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
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
      loadWalletInfo(); // 잔고 새로고침
      setTimeout(() => setChargeStatus('idle'), 3000);
    }
  }, [isConfirming, isConfirmed]);

  const loadWalletInfo = async () => {
    setWalletLoading(true);
    try {
      const [addrRes, balRes] = await Promise.all([
        api.get<{ smartWalletAddress: string | null }>('/wallet/address'),
        api.get<SmartWalletData>('/wallet/balance').catch(() => null),
      ]);

      if (addrRes.smartWalletAddress) {
        setSmartWallet({
          address: addrRes.smartWalletAddress,
          ownerAddress: balRes?.ownerAddress || '',
          balanceUsdMicros: balRes?.balanceUsdMicros || 0,
        });
      }
    } catch {
      // 무시 — Smart Wallet 미생성 상태
    } finally {
      setWalletLoading(false);
    }
  };

  const handleCharge = () => {
    if (!smartWallet?.address || !chargeAmount) return;
    const amount = parseFloat(chargeAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      writeContract({
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

  const formatUsd = (micros: number) => (micros / 1_000_000).toFixed(6);

  return (
    <>
      <div className="page-header">
        <h2>Settings</h2>
        <p>계정 및 API 설정 관리</p>
      </div>

      {/* 계정 정보 */}
      <div className="card mb-24">
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

      {/* Smart Wallet + 충전 */}
      <div className="card mb-24">
        <div className="card-header">
          <span className="card-title">
            <Wallet size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Smart Wallet
          </span>
        </div>

        {walletLoading ? (
          <div className="flex items-center gap-8" style={{ padding: '10px 0' }}>
            <RefreshCw size={14} className="spin" />
            <span className="text-muted text-sm">지갑 정보 로딩 중...</span>
          </div>
        ) : smartWallet ? (
          <>
            {/* Smart Wallet 주소 */}
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

            {/* 잔고 */}
            <div className="form-group">
              <label className="label">USDC 잔고</label>
              <div className="flex items-center gap-12">
                <span className="badge badge-info" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                  ${formatUsd(smartWallet.balanceUsdMicros)} USDC
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadWalletInfo}
                  style={{ padding: '2px 8px' }}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>

            {/* 외부 지갑 연결 + 충전 */}
            <div className="form-group">
              <label className="label">
                <Link2 size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                외부 지갑 → Smart Wallet 충전
              </label>

              {!isConnected ? (
                <div>
                  <p className="text-xs text-muted mb-8">
                    외부 지갑을 연결하면 USDC를 Smart Wallet으로 직접 충전할 수 있습니다.
                  </p>
                  <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                    {connectors.map((connector) => (
                      <button
                        key={connector.uid}
                        className="btn btn-secondary btn-sm"
                        onClick={() => connect({ connector })}
                      >
                        <Link2 size={12} />
                        {connector.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {/* 연결된 지갑 정보 */}
                  <div className="flex items-center gap-8 mb-12">
                    <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                      ✓ 연결됨
                    </span>
                    <code className="font-mono" style={{ fontSize: '0.7rem' }}>
                      {externalAddress?.slice(0, 8)}...{externalAddress?.slice(-6)}
                    </code>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => disconnect()}
                      style={{ padding: '2px 8px' }}
                    >
                      <Unlink size={10} />
                    </button>
                  </div>

                  {/* 충전 입력 */}
                  <div className="flex items-center gap-8">
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                      placeholder="USDC 금액"
                      style={{ width: 140 }}
                    />
                    <span className="text-sm text-muted">USDC</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleCharge}
                      disabled={isSending || isConfirming}
                    >
                      {isSending ? (
                        <><Loader size={12} className="spin" /> 서명 중...</>
                      ) : isConfirming ? (
                        <><Loader size={12} className="spin" /> 확인 중...</>
                      ) : (
                        <><ArrowUpRight size={12} /> 충전</>
                      )}
                    </button>
                  </div>

                  {/* 상태 메시지 */}
                  {chargeStatus === 'confirming' && (
                    <p className="text-xs text-muted mt-8">
                      ⏳ 트랜잭션 확인 중... 잠시만 기다려주세요.
                    </p>
                  )}
                  {chargeStatus === 'done' && (
                    <p className="text-xs mt-8" style={{ color: 'var(--success)' }}>
                      ✅ 충전 완료! 잔고가 업데이트되었습니다.
                    </p>
                  )}
                  {chargeStatus === 'error' && (
                    <p className="text-xs mt-8" style={{ color: 'var(--error)' }}>
                      ❌ 충전 실패. 지갑 잔고를 확인해주세요.
                    </p>
                  )}
                  {txHash && (
                    <p className="text-xs text-muted mt-4">
                      TX:{' '}
                      <a
                        href={`https://sepolia.basescan.org/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)' }}
                      >
                        {txHash.slice(0, 14)}...
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-secondary text-sm">
            Smart Wallet이 아직 생성되지 않았습니다. API Key 발급 시 자동 생성됩니다.
          </p>
        )}
      </div>

      {/* API Key */}
      <div className="card mb-24">
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
