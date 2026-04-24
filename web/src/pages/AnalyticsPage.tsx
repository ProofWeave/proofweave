import { useState, type CSSProperties } from 'react';

const MODELS = {
  'gemini-3-flash': { label: 'Gemini 3 Flash', inputPer1M: 0.10, outputPer1M: 0.40 },
  'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', inputPer1M: 1.25, outputPer1M: 5.00 },
  'gpt-4o':         { label: 'GPT-4o',         inputPer1M: 2.50, outputPer1M: 10.00 },
  'claude-sonnet':  { label: 'Claude Sonnet',  inputPer1M: 3.00, outputPer1M: 15.00 },
} as const;

type ModelKey = keyof typeof MODELS;

const PRESETS: { label: string; input: number; output: number; calls: number }[] = [
  { label: '간단한 분석',      input: 200,  output: 800,  calls: 1 },
  { label: '보안 감사',        input: 500,  output: 2000, calls: 1 },
  { label: '코드 리뷰',        input: 2000, output: 5000, calls: 1 },
  { label: '대량 배치 (10건)', input: 1000, output: 3000, calls: 10 },
];

export function AnalyticsPage() {
  const [inputTokens, setInputTokens] = useState(500);
  const [outputTokens, setOutputTokens] = useState(2000);
  const [calls, setCalls] = useState(1);
  const [model, setModel] = useState<ModelKey>('gemini-3-flash');

  const m = MODELS[model];
  const aiCost = ((inputTokens * m.inputPer1M + outputTokens * m.outputPer1M) / 1e6) * calls;
  const pwCost = 0.01 * calls;
  const saved = Math.max(aiCost - pwCost, 0);
  const pct = aiCost > 0 ? Math.round((saved / aiCost) * 100) : 0;
  const maxBar = Math.max(aiCost, pwCost, 0.001);

  const sliderStyle = (val: number, max: number): CSSProperties => ({
    background: `linear-gradient(90deg, var(--accent-purple) ${(val / max) * 100}%, var(--bg-tertiary) ${(val / max) * 100}%)`,
  });

  const circ = 2 * Math.PI * 58;

  return (
    <>
      <div className="page-header">
        <h2>Cost Analytics</h2>
        <p>인터랙티브 토큰 비용 비교</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="filter-chip"
            onClick={() => {
              setInputTokens(p.input);
              setOutputTokens(p.output);
              setCalls(p.calls);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <label className="label">AI 모델</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.entries(MODELS) as [ModelKey, typeof MODELS[ModelKey]][]).map(([k, v]) => (
                <button
                  key={k}
                  className={`filter-chip ${model === k ? 'filter-chip--active' : ''}`}
                  style={{ justifyContent: 'center', fontSize: '0.78rem' }}
                  onClick={() => setModel(k)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="label" style={{ margin: 0 }}>입력 토큰</label>
              <span className="badge badge-info" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                {inputTokens.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={50000}
              step={50}
              value={inputTokens}
              onChange={(e) => setInputTokens(+e.target.value)}
              style={{ width: '100%', accentColor: 'var(--accent-purple)', height: 6, borderRadius: 999, ...sliderStyle(inputTokens, 50000) }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-xs text-muted">50</span>
              <span className="text-xs text-muted">50,000</span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="label" style={{ margin: 0 }}>출력 토큰</label>
              <span className="badge badge-info" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                {outputTokens.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={100000}
              step={100}
              value={outputTokens}
              onChange={(e) => setOutputTokens(+e.target.value)}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)', height: 6, borderRadius: 999 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-xs text-muted">100</span>
              <span className="text-xs text-muted">100,000</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="label" style={{ margin: 0 }}>호출 횟수</label>
              <span className="badge badge-purple" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                {calls}회
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={calls}
              onChange={(e) => setCalls(+e.target.value)}
              style={{ width: '100%', accentColor: 'var(--accent-green)', height: 6, borderRadius: 999 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-xs text-muted">1회</span>
              <span className="text-xs text-muted">50회</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
              <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, transform: 'rotate(-90deg)' }}>
                <circle cx="70" cy="70" r="58" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                <circle
                  cx="70"
                  cy="70"
                  r="58"
                  fill="none"
                  stroke="var(--accent-green)"
                  strokeWidth="12"
                  strokeDasharray={`${circ}`}
                  strokeDashoffset={`${circ * (1 - pct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-green)', lineHeight: 1 }}>{pct}%</span>
                <span className="text-xs text-muted">절감률</span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="text-sm" style={{ fontWeight: 600 }}>AI 직접 호출</span>
              <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-red)' }}>
                ${aiCost.toFixed(4)}
              </span>
            </div>
            <div style={{ height: 28, borderRadius: 8, background: 'var(--bg-tertiary)', overflow: 'hidden', position: 'relative' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 8,
                  background: 'linear-gradient(90deg, var(--accent-red), #D46A70)',
                  width: `${Math.max((aiCost / maxBar) * 100, 2)}%`,
                  transition: 'width 0.4s ease',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10,
                }}
              >
                {aiCost / maxBar > 0.15 && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white' }}>{m.label}</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="text-sm" style={{ fontWeight: 600 }}>ProofWeave 구매</span>
              <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                ${pwCost.toFixed(4)}
              </span>
            </div>
            <div style={{ height: 28, borderRadius: 8, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 8,
                  background: 'linear-gradient(90deg, var(--accent-green), #6BA57A)',
                  width: `${Math.max((pwCost / maxBar) * 100, 2)}%`,
                  transition: 'width 0.4s ease',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10,
                }}
              >
                {pwCost / maxBar > 0.15 && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white' }}>ProofWeave</span>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--accent-green-dim)',
              border: '1px solid rgba(74, 124, 89, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div className="text-xs text-muted">예상 절감액</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                ${saved.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-xs text-muted">토큰 절약</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                ~{((inputTokens + outputTokens) * calls).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">모델별 단가 비교</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {(Object.entries(MODELS) as [ModelKey, typeof MODELS[ModelKey]][]).map(([k, v]) => {
            const cost = ((inputTokens * v.inputPer1M + outputTokens * v.outputPer1M) / 1e6) * calls;
            const sv = Math.max(cost - pwCost, 0);
            const svPct = cost > 0 ? Math.round((sv / cost) * 100) : 0;
            const isActive = k === model;
            const barColor =
              svPct > 50 ? 'var(--accent-green)' : svPct > 20 ? 'var(--accent-amber)' : 'var(--accent-red)';
            return (
              <div
                key={k}
                style={{
                  background: isActive ? 'var(--accent-purple-dim)' : 'var(--bg-tertiary)',
                  border: `1px solid ${isActive ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => setModel(k)}
              >
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: isActive ? 'var(--accent-purple)' : 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {v.label}
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  ${cost.toFixed(4)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  입력 ${v.inputPer1M}/1M · 출력 ${v.outputPer1M}/1M
                </div>
                <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      background: barColor,
                      width: `${svPct}%`,
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
                <div className="text-xs" style={{ marginTop: 4, color: svPct > 50 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {svPct}% 절감
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
