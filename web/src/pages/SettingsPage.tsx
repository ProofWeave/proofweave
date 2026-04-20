import { useState, useEffect } from 'react';
import { Copy, Check, Key, Wallet, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

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
  const apiKey = api.getApiKey();

  // Smart Wallet 정보 로드
  useEffect(() => {
    if (!apiKey) {
      setWalletLoading(false);
      return;
    }
    loadWalletInfo();
  }, [apiKey]);

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
          <input
            className="input"
            value={user?.email || '—'}
            readOnly
          />
        </div>
        <div className="form-group">
          <label className="label">로그인 방식</label>
          <input
            className="input"
            value={user?.app_metadata?.provider || 'email'}
            readOnly
          />
        </div>
        <div className="form-group">
          <label className="label">
            <Wallet size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            CDP Smart Wallet
          </label>
          {walletLoading ? (
            <div className="flex items-center gap-8" style={{ padding: '10px 0' }}>
              <RefreshCw size={14} className="spin" />
              <span className="text-muted text-sm">지갑 정보 로딩 중...</span>
            </div>
          ) : smartWallet ? (
            <>
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
              <div className="flex items-center gap-12 mt-8">
                <span className="badge badge-info" style={{ fontSize: '0.8rem' }}>
                  잔고: ${formatUsd(smartWallet.balanceUsdMicros)} USDC
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadWalletInfo}
                  style={{ padding: '2px 8px' }}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
              <p className="text-xs text-muted mt-8">
                이 주소로 USDC를 전송하면 데이터 구매 시 자동 결제됩니다.
              </p>
            </>
          ) : (
            <p className="text-secondary text-sm">
              Smart Wallet이 아직 생성되지 않았습니다. API Key 발급 시 자동 생성됩니다.
            </p>
          )}
        </div>
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

      {/* 가격 설정 */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">내 Attestation 가격 설정</span>
        </div>
        <div className="form-group">
          <label className="label">데이터 열람 가격 (USDC)</label>
          <input
            className="input"
            type="number"
            step="0.001"
            min="0"
            placeholder="0.01"
            disabled
          />
        </div>
        <button className="btn btn-primary" disabled>
          가격 저장
        </button>
        <span className="text-xs text-muted" style={{ marginLeft: 12 }}>
          백엔드 PUT /pricing 연동 후 활성화
        </span>
      </div>
    </>
  );
}
