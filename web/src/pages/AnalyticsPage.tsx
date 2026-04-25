import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Coins, Database, Repeat2, Zap } from 'lucide-react';
import { api } from '../lib/api';

type AnalyticsRange = '7d' | '30d' | '90d' | 'all';

interface AnalyticsResponse {
  range: AnalyticsRange;
  summary: {
    directLlmCalls: number;
    directInputTokens: number;
    directOutputTokens: number;
    directCostUsdMicros: number;
    baselineAttestations: number;
    uniqueReuseEvents: number;
    avoidedInputTokens: number;
    avoidedOutputTokens: number;
    avoidedCostUsdMicros: number;
    actualReuseLlmCostUsdMicros: number;
    netAvoidedLlmCostUsdMicros: number;
    averageReuseEfficiency: number;
    meteredReuseRatio: number;
  };
  trend: Array<{
    day: string;
    uniqueReuseEvents: number;
    avoidedTokens: number;
    avoidedCostUsdMicros: number;
  }>;
  byModel: Array<{
    model: string;
    uniqueReuseEvents: number;
    avoidedTokens: number;
    avoidedCostUsdMicros: number;
  }>;
  recentReuse: Array<{
    attestationId: string;
    title?: string;
    domain?: string;
    model: string;
    avoidedTokens: number;
    avoidedCostUsdMicros: number;
    reusedAt: string;
  }>;
}

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
  { value: 'all', label: '전체' },
];

function formatUsdMicros(value: number): string {
  return `$${(value / 1_000_000).toFixed(6)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function toNumericValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function truncateId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function KpiCard({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  color: 'purple' | 'cyan' | 'green' | 'amber';
}) {
  return (
    <div className={`card kpi-card ${color}`}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        <div className={`kpi-icon ${color}`}>{icon}</div>
      </div>
      <div className="card-value">{value}</div>
      <div className="text-xs text-muted mt-8">{detail}</div>
    </div>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api.get<AnalyticsResponse>(`/stats/analytics/me?range=${range}`)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Analytics load failed');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const handleRangeChange = (nextRange: AnalyticsRange) => {
    if (nextRange === range) return;
    setRange(nextRange);
    setLoading(true);
    setError(null);
  };

  const summary = data?.summary;
  const avoidedTokens = summary
    ? summary.avoidedInputTokens + summary.avoidedOutputTokens
    : 0;
  const directTokens = summary
    ? summary.directInputTokens + summary.directOutputTokens
    : 0;
  const hasUsage = Boolean(summary && (summary.directLlmCalls > 0 || summary.uniqueReuseEvents > 0));
  const costBars = summary
    ? [
        { name: '직접 생성', cost: summary.directCostUsdMicros },
        { name: '회피 비용', cost: summary.avoidedCostUsdMicros },
        { name: '순 효과', cost: summary.netAvoidedLlmCostUsdMicros },
      ]
    : [];

  return (
    <>
      <div className="page-header">
        <h2>Analytics</h2>
        <p>실제 LLM 토큰 사용량과 데이터 재사용 절감 지표</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {RANGES.map((item) => (
          <button
            key={item.value}
            className={`filter-chip ${range === item.value ? 'filter-chip--active' : ''}`}
            onClick={() => handleRangeChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="spinner" /> <span className="text-muted ml-8">Analytics 불러오는 중...</span>
        </div>
      )}

      {!loading && error && (
        <div className="card" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
          {error}
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <div className="bento-grid">
            <KpiCard
              title="절감된 토큰"
              value={formatTokens(avoidedTokens)}
              detail={`입력 ${formatTokens(summary.avoidedInputTokens)} · 출력 ${formatTokens(summary.avoidedOutputTokens)}`}
              icon={<Zap size={20} />}
              color="green"
            />
            <KpiCard
              title="절감된 LLM 비용"
              value={formatUsdMicros(summary.avoidedCostUsdMicros)}
              detail={`실제 재사용 LLM 비용 ${formatUsdMicros(summary.actualReuseLlmCostUsdMicros)}`}
              icon={<Coins size={20} />}
              color="amber"
            />
            <KpiCard
              title="고유 재사용"
              value={`${summary.uniqueReuseEvents.toLocaleString()}건`}
              detail="같은 사용자/데이터 중복 제외"
              icon={<Repeat2 size={20} />}
              color="cyan"
            />
            <KpiCard
              title="평균 데이터 효율"
              value={`${summary.averageReuseEfficiency.toFixed(2)}x`}
              detail={`${Math.round(summary.meteredReuseRatio * 100)}% 계측 데이터 기준`}
              icon={<Database size={20} />}
              color="purple"
            />
          </div>

          {!hasUsage && (
            <div className="card mb-24" style={{ padding: 28 }}>
              <div className="empty-state" style={{ padding: 0 }}>
                <div className="empty-state-icon">
                  <BarChart3 size={22} />
                </div>
                <h3 style={{ marginBottom: 8 }}>아직 계측된 Analytics가 없습니다</h3>
                <p>
                  AI 분석을 실행하고 Attest로 등록한 뒤, 해당 데이터가 최초 조회되면 실제 토큰 절감 지표가 채워집니다.
                </p>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 20,
              marginBottom: 24,
            }}
          >
            <div className="card" style={{ minHeight: 320 }}>
              <div className="card-header">
                <span className="card-title">비용 비교</span>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={costBars} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    tickFormatter={(value: number) => formatUsdMicros(value)}
                  />
                  <Tooltip
                    formatter={(value) => [formatUsdMicros(toNumericValue(value)), '비용']}
                    contentStyle={{ borderRadius: 8, borderColor: 'var(--border-default)' }}
                  />
                  <Bar dataKey="cost" fill="var(--accent-purple)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted">
                직접 생성 토큰 {formatTokens(directTokens)} · 순 LLM 비용 효과 {formatUsdMicros(summary.netAvoidedLlmCostUsdMicros)}
              </div>
            </div>

            <div className="card" style={{ minHeight: 320 }}>
              <div className="card-header">
                <span className="card-title">일자별 재사용 추이</span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data?.trend ?? []} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === 'avoidedTokens'
                        ? formatTokens(toNumericValue(value))
                        : toNumericValue(value).toLocaleString(),
                      name === 'avoidedTokens' ? '회피 토큰' : '고유 재사용',
                    ]}
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ borderRadius: 8, borderColor: 'var(--border-default)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avoidedTokens"
                    stroke="var(--accent-green)"
                    fill="var(--accent-green-dim)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="uniqueReuseEvents"
                    stroke="var(--accent-cyan)"
                    fill="var(--accent-cyan-dim)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            <div className="card">
              <div className="card-header">
                <span className="card-title">모델별 절감</span>
              </div>
              {data.byModel.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.byModel.map((row) => (
                    <div key={row.model}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span className="text-sm" style={{ fontWeight: 600 }}>{row.model}</span>
                        <span className="font-mono text-sm">{formatUsdMicros(row.avoidedCostUsdMicros)}</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(4, avoidedTokens ? (row.avoidedTokens / avoidedTokens) * 100 : 0))}%`,
                            height: '100%',
                            background: 'var(--accent-cyan)',
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted mt-4">
                        {formatTokens(row.avoidedTokens)} tokens · {row.uniqueReuseEvents}건
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">모델별 재사용 데이터가 없습니다.</p>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">최근 재사용 데이터</span>
              </div>
              {data.recentReuse.length > 0 ? (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Model</th>
                        <th>Saved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentReuse.map((row) => (
                        <tr key={`${row.attestationId}-${row.reusedAt}`}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {row.title || truncateId(row.attestationId)}
                            </div>
                            <div className="text-xs text-muted">
                              {row.domain || 'unknown'} · {formatDate(row.reusedAt)}
                            </div>
                          </td>
                          <td className="text-xs">{row.model}</td>
                          <td>
                            <div className="font-mono text-xs">{formatUsdMicros(row.avoidedCostUsdMicros)}</div>
                            <div className="text-xs text-muted">{formatTokens(row.avoidedTokens)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">최근 재사용 데이터가 없습니다.</p>
              )}
            </div>
          </div>

          <div className="card mt-24" style={{ padding: 16 }}>
            <p className="text-sm text-muted">
              같은 사용자가 같은 데이터를 여러 번 조회해도 최초 1회만 재사용으로 집계됩니다.
              최초 분석 생성 비용과 Attestation 등록 비용은 절감액에 포함하지 않습니다.
            </p>
          </div>
        </>
      )}
    </>
  );
}
