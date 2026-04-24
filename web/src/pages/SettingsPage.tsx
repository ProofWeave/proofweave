import { useState, useEffect } from 'react';
import { Copy, Check, Key, Wallet, RefreshCw, Link2, Unlink, ArrowUpRight, Loader, Plus, ShoppingBag, ExternalLink } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { baseSepolia } from 'wagmi/chains';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { MyDataSection } from '../components/MyDataSection';
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_TRANSFER_ABI } from '../config/wagmi';

interface SmartWalletData {
  address: string;
  ownerAddress: string;
  balanceUsdMicros: number;
}

interface PurchaseRecord {
  attestationId: string;
  amountUsd: string;
  amountUsdMicros: number;
  paymentMethod: string;
  txHash: string;
  receiptId: string;
  createdAt: string;
}

export function SettingsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [walletLoading, setWalletLoading] = useState(true);
  const [smartWallet, setSmartWallet] = useState<SmartWalletData | null>(null);
  const [chargeAmount, setChargeAmount] = useState('5');
  const [chargeStatus, setChargeStatus] = useState<'idle' | 'confirming' | 'done' | 'error'>('idle');
  const [creating, setCreating] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
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

  // 구매 내역 로드
  useEffect(() => {
    api.get<{ purchases: PurchaseRecord[] }>('/purchases/history')
      .then((data) => setPurchases(data.purchases))
      .catch(() => setPurchases([]))
      .finally(() => setPurchasesLoading(false));
  }, []);

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

      {/* Smart Wallet */}
      <div className="card mb-24">
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
            {/* 주소 */}
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
              <span
                className="badge badge-info"
                style={{ fontSize: '1rem', padding: '8px 16px', display: 'inline-block' }}
              >
                ${formatUsd(smartWallet.balanceUsdMicros)} USDC
              </span>
            </div>

            <p className="text-xs text-muted">
              이 지갑에 USDC가 있으면 데이터 구매 시 자동 결제됩니다.
            </p>
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

      {/* 외부 지갑 연결 + 충전 (항상 표시) */}
      <div className="card mb-24">
        <div className="card-header">
          <span className="card-title">
            <Link2 size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            외부 지갑 연결 / USDC 충전
          </span>
        </div>

        {!isConnected ? (
          <div>
            <p className="text-sm text-muted mb-12">
              외부 지갑(Rabby, MetaMask 등)을 연결하면 Smart Wallet으로 USDC를 직접 충전할 수 있습니다.
            </p>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  className="btn btn-primary"
                  onClick={() => connect({ connector })}
                  style={{ minWidth: 160 }}
                >
                  <Link2 size={14} />
                  {connector.name} 연결
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* 연결된 지갑 */}
            <div className="form-group">
              <label className="label">연결된 지갑</label>
              <div className="flex items-center gap-8">
                <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>
                  ✓ 연결됨
                </span>
                <code className="font-mono" style={{ fontSize: '0.75rem' }}>
                  {externalAddress}
                </code>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => disconnect()}
                  style={{ padding: '2px 8px' }}
                >
                  <Unlink size={12} /> 해제
                </button>
              </div>
            </div>

            {/* 충전 UI */}
            {smartWallet ? (
              <div className="form-group">
                <label className="label">Smart Wallet 충전</label>
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
                    className="btn btn-primary"
                    onClick={handleCharge}
                    disabled={isSending || isConfirming}
                  >
                    {isSending ? (
                      <><Loader size={14} className="spin" /> 서명 중...</>
                    ) : isConfirming ? (
                      <><Loader size={14} className="spin" /> 확인 중...</>
                    ) : (
                      <><ArrowUpRight size={14} /> 충전하기</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted mt-4">
                  연결된 지갑에서 Smart Wallet({smartWallet.address.slice(0, 8)}...)으로 USDC를 전송합니다.
                </p>

                {/* 상태 메시지 */}
                {chargeStatus === 'confirming' && (
                  <p className="text-xs text-muted mt-8">⏳ 트랜잭션 확인 중...</p>
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
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs"
                    style={{ color: 'var(--accent)', marginTop: 4, display: 'inline-block' }}
                  >
                    TX: {txHash.slice(0, 14)}... ↗
                  </a>
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

      {/* ─── 내 데이터 ─────────────────────────── */}
      <MyDataSection />

      {/* ─── 구매 내역 ─────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-8 mb-16">
          <ShoppingBag size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0 }}>구매 내역</h3>
        </div>

        {purchasesLoading ? (
          <div className="flex items-center gap-8" style={{ padding: 20 }}>
            <Loader size={16} className="spin" />
            <span className="text-muted text-sm">불러오는 중...</span>
          </div>
        ) : purchases.length === 0 ? (
          <p className="text-secondary text-sm" style={{ padding: '20px 0' }}>
            아직 구매한 데이터가 없습니다.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Attestation</th>
                  <th>금액</th>
                  <th>결제일</th>
                  <th>TX</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.receiptId}>
                    <td className="mono text-xs" title={p.attestationId}>
                      {p.attestationId.slice(0, 8)}...{p.attestationId.slice(-6)}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>${p.amountUsd}</span>
                      <span className="text-xs text-muted" style={{ marginLeft: 4 }}>USDC</span>
                    </td>
                    <td className="text-xs">
                      {new Date(p.createdAt).toLocaleDateString('ko-KR', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <a
                        href={`https://sepolia.basescan.org/tx/${p.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ textDecoration: 'none', padding: '2px 8px' }}
                      >
                        <ExternalLink size={12} />
                        Tx
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
