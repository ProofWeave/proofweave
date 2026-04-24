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

      {/* ═══ Row 1: 계정정보 + Smart Wallet + 외부 지갑 ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

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
                  <p className="text-xs mt-8" style={{ color: 'var(--success)' }}>
                    ✅ 충전 완료! 잔고가 업데이트되었습니다.
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

      {/* ═══ Row 2: MyData (2/3) + 구매내역 (1/3) ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>

      {/* 내 데이터 */}
      <MyDataSection />

      {/* 구매 내역 */}
      <div className="card">
        <div className="flex items-center gap-8 mb-16">
          <ShoppingBag size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: '0.9rem' }}>구매 내역</h3>
        </div>

        {purchasesLoading ? (
          <div className="flex items-center gap-8" style={{ padding: 20 }}>
            <Loader size={16} className="spin" />
            <span className="text-muted text-sm">불러오는 중...</span>
          </div>
        ) : purchases.length === 0 ? (
          <p className="text-secondary text-sm">기록이 없습니다.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Attestation</th>
                  <th>금액</th>
                  <th>일자</th>
                  <th>TX</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.receiptId}>
                    <td className="mono text-xs">{p.attestationId.slice(0, 6)}...</td>
                    <td>${p.amountUsd}</td>
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
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </div>{/* end Row 2 */}

      {/* ═══ Row 3: API Key (하단) ═══ */}
      <div className="card">
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
