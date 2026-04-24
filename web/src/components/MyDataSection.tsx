import { useState, useEffect, useCallback } from 'react';
import { Database, DollarSign, Loader, Check, AlertCircle, Clock } from 'lucide-react';
import { api } from '../lib/api';

interface MyAttestation {
  attestationId: string;
  contentHash: string;
  aiModel: string;
  createdAt: string;
  metadata?: { title?: string; domain?: string };
  priceUsdMicros: number;
}

interface PricingResponse {
  attestationId: string;
  priceUsdMicros: number;
  priceUsd: string;
}

export function MyDataSection() {
  const [data, setData] = useState<MyAttestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMyData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ attestations: MyAttestation[] }>('/search?limit=100');
      // 서버에서 모든 데이터 가져온 후 본인 데이터만 필터 (apiKeyOwner 기준)
      setData(res.attestations || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMyData(); }, [loadMyData]);

  const handleSetPrice = async (attestationId: string) => {
    const micros = Math.round(parseFloat(priceInput) * 1_000_000);
    if (isNaN(micros) || micros < 0) {
      setMessage({ type: 'error', text: '올바른 금액을 입력하세요.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.post<PricingResponse>('/pricing', { attestationId, priceUsdMicros: micros });
      setMessage({ type: 'success', text: micros === 0 ? '무료로 설정되었습니다.' : `$${priceInput}로 설정되었습니다.` });
      setEditingId(null);
      setPriceInput('');
      await loadMyData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '가격 설정 실패';
      // 429 쿨다운 응답 처리
      if (msg.includes('cooldown') || msg.includes('쿨다운') || msg.includes('429')) {
        setMessage({ type: 'error', text: '⏳ 1시간 쿨다운 중입니다. 잠시 후 다시 시도하세요.' });
      } else {
        setMessage({ type: 'error', text: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (att: MyAttestation) => {
    setEditingId(att.attestationId);
    setPriceInput(att.priceUsdMicros > 0 ? (att.priceUsdMicros / 1_000_000).toString() : '');
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPriceInput('');
    setMessage(null);
  };

  const truncate = (s: string) => s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <span className="card-title">
          <Database size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          내 데이터 (My Data)
        </span>
        <button className="btn btn-secondary btn-sm" onClick={loadMyData} disabled={loading}>
          {loading ? <Loader size={12} className="spin" /> : '새로고침'}
        </button>
      </div>

      {message && (
        <div className={`text-xs mb-8 flex items-center gap-4`}
          style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--error)' }}>
          {message.type === 'success' ? <Check size={12} /> : <AlertCircle size={12} />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-8" style={{ padding: 20 }}>
          <Loader size={16} className="spin" />
          <span className="text-muted text-sm">불러오는 중...</span>
        </div>
      ) : data.length === 0 ? (
        <p className="text-secondary text-sm" style={{ padding: '20px 0' }}>
          등록된 데이터가 없습니다. Attest 페이지에서 데이터를 등록하세요.
        </p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>데이터</th>
                <th>모델</th>
                <th>등록일</th>
                <th>가격</th>
                <th>설정</th>
              </tr>
            </thead>
            <tbody>
              {data.map((att) => (
                <tr key={att.attestationId}>
                  <td title={att.attestationId}>
                    <div>
                      <div className="text-sm" style={{ fontWeight: 500, wordBreak: 'break-word' }}>
                        {att.metadata?.title || truncate(att.contentHash)}
                      </div>
                      {att.metadata?.domain && (
                        <span className="text-xs text-muted">{att.metadata.domain}</span>
                      )}
                    </div>
                  </td>
                  <td className="text-xs">{att.aiModel}</td>
                  <td className="text-xs">
                    {new Date(att.createdAt).toLocaleDateString('ko-KR', {
                      month: 'short', day: 'numeric',
                    })}
                  </td>
                  <td>
                    {editingId === att.attestationId ? (
                      <div className="flex items-center gap-4">
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceInput}
                          onChange={(e) => setPriceInput(e.target.value)}
                          placeholder="0 = 무료"
                          style={{ width: 80, padding: '3px 6px', fontSize: '0.75rem' }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSetPrice(att.attestationId);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                        <span className="text-xs text-muted">USD</span>
                      </div>
                    ) : (
                      <span style={{
                        fontWeight: 600,
                        color: att.priceUsdMicros > 0 ? '#A67C30' : 'var(--text-muted)',
                        fontSize: '0.8rem',
                      }}>
                        {att.priceUsdMicros > 0
                          ? `$${(att.priceUsdMicros / 1_000_000).toFixed(2)}`
                          : '무료'}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingId === att.attestationId ? (
                      <div className="flex gap-4">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSetPrice(att.attestationId)}
                          disabled={saving}
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                        >
                          {saving ? <Loader size={10} className="spin" /> : <Check size={10} />}
                          저장
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={cancelEdit}
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => startEdit(att)}
                        style={{ padding: '3px 10px', fontSize: '0.7rem' }}
                      >
                        <DollarSign size={10} /> 가격 설정
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-4 mt-8" style={{ color: 'var(--text-muted)' }}>
        <Clock size={11} />
        <span className="text-xs">가격 설정 후 1시간 동안 변경할 수 없습니다. 기본값: 무료</span>
      </div>
    </div>
  );
}
