import { useState } from 'react';
import { Copy, Check, Key, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export function SettingsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const apiKey = api.getApiKey();

  const copyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
            CDP Smart Account (읽기 전용)
          </label>
          <input
            className="input font-mono"
            value="서버에서 관리 · /auth/register 연동 후 표시"
            readOnly
          />
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
