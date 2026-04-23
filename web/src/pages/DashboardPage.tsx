import { useState, useEffect } from 'react';
import { FileCheck, ShoppingCart, DollarSign, TrendingUp, Cpu, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { AttestationMetadataView } from '../components/AttestationCard';

// ── Types ────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  change?: string;
  changeUp?: boolean;
  color: 'purple' | 'cyan' | 'green' | 'amber';
  loading?: boolean;
}

function KpiCard({ title, value, icon, change, changeUp, color, loading }: KpiCardProps) {
  return (
    <div className={`card kpi-card ${color}`}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        <div className={`kpi-icon ${color}`}>{icon}</div>
      </div>
      <div className="card-value">
        {loading ? <div className="skeleton" style={{ width: 60, height: 32 }} /> : value}
      </div>
      {change && (
        <div className="mt-8">
          <span className={`kpi-change ${changeUp ? 'up' : 'down'}`}>
            {changeUp ? '↑' : '↓'} {change}
          </span>
        </div>
      )}
    </div>
  );
}

interface AttestationRow {
  attestationId: string;
  contentHash: string;
  creator: string;
  aiModel: string;
  txHash: string;
  createdAt: string;
  metadata?: AttestationMetadataView;
}

interface SearchResponse {
  count: number;
  totalCount: number;
  attestations: AttestationRow[];
}

// ── Domain color/label map ──────────────────────────────────

const DOMAIN_CONFIG: Record<string, { label: string; color: string }> = {
  defi:            { label: 'DeFi',           color: 'var(--accent-purple)' },
  smart_contract:  { label: 'Smart Contract', color: 'var(--accent-cyan)' },
  security:        { label: 'Security',       color: 'var(--accent-red)' },
  legal:           { label: 'Legal',          color: 'var(--accent-amber)' },
  data_analysis:   { label: 'Data Analysis',  color: 'var(--accent-green)' },
};

// ── Component ───────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, myData: 0 });
  const [myStats, setMyStats] = useState({ purchases: 0, savings: '$0' });
  const [recent, setRecent] = useState<AttestationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [searchData, statsData] = await Promise.all([
          api.get<SearchResponse>('/search?limit=10'),
          api.get<{
            totalPurchases: number;
            totalAttestations: number;
            estimatedSavingsUsd: string;
          }>('/stats/me').catch(() => null),
        ]);

        setRecent(searchData.attestations || []);
        setStats({ total: searchData.totalCount || searchData.count || 0, myData: statsData?.totalAttestations || 0 });
        if (statsData) {
          setMyStats({
            purchases: statsData.totalPurchases,
            savings: `$${statsData.estimatedSavingsUsd}`,
          });
        }
      } catch (err) {
        console.warn('[Dashboard] fetch failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 도메인 분포 계산
  const domainCounts = recent.reduce<Record<string, number>>((acc, att) => {
    const domain = att.metadata?.domain || 'unknown';
    acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {});
  const maxDomainCount = Math.max(...Object.values(domainCounts), 1);

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>ProofWeave 전체 현황을 한눈에</p>
      </div>

      <div className="bento-grid">
        <KpiCard
          title="Total Attestations"
          value={String(stats.total)}
          icon={<FileCheck size={20} />}
          color="purple"
          loading={loading}
        />
        <KpiCard
          title="My Data"
          value={String(stats.myData)}
          icon={<TrendingUp size={20} />}
          color="cyan"
          loading={loading}
        />
        <KpiCard
          title="Purchases"
          value={String(myStats.purchases)}
          icon={<ShoppingCart size={20} />}
          color="green"
          loading={loading}
        />
        <KpiCard
          title="Cost Saved"
          value={myStats.savings}
          icon={<DollarSign size={20} />}
          color="amber"
          loading={loading}
        />
      </div>

      {/* Domain Distribution */}
      {Object.keys(domainCounts).length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <span className="card-title">도메인 분포</span>
          </div>
          <div className="domain-bar">
            {Object.entries(domainCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([domain, count]) => {
                const config = DOMAIN_CONFIG[domain] || { label: domain, color: 'var(--text-muted)' };
                const widthPct = Math.max((count / maxDomainCount) * 100, 4);
                return (
                  <div key={domain} className="domain-bar__row">
                    <span className="domain-bar__label">{config.label}</span>
                    <div className="domain-bar__track">
                      <div
                        className="domain-bar__fill"
                        style={{ width: `${widthPct}%`, background: config.color }}
                      />
                    </div>
                    <span className="domain-bar__count">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent Attestations — with metadata */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">최근 Attestations</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/explorer')}
          >
            전체 보기
          </button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Title / Hash</th>
                <th>Domain</th>
                <th>Model</th>
                <th>Language</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40 }}>
                    <div className="flex items-center justify-between gap-12" style={{ justifyContent: 'center' }}>
                      <span className="spinner" /> 로딩 중...
                    </div>
                  </td>
                </tr>
              ) : recent.length > 0 ? (
                recent.map((att) => {
                  const meta = att.metadata;
                  const hasTitle = meta?.metadataStatus === 'ready' && meta?.title;
                  return (
                    <tr key={att.attestationId} style={{ cursor: 'pointer' }} onClick={() => navigate('/explorer')}>
                      <td title={att.contentHash}>
                        <div style={{ fontWeight: hasTitle ? 600 : 400, color: hasTitle ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {hasTitle ? meta!.title : truncateHash(att.contentHash)}
                        </div>
                        {hasTitle && (
                          <div className="mono text-xs text-muted" style={{ marginTop: 2 }}>
                            {truncateHash(att.contentHash)}
                          </div>
                        )}
                      </td>
                      <td>
                        {meta?.domain ? (
                          <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                            {DOMAIN_CONFIG[meta.domain]?.label || meta.domain}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                          <Cpu size={10} style={{ marginRight: 2 }} />
                          {att.aiModel}
                        </span>
                      </td>
                      <td>
                        {meta?.language ? (
                          <span className="text-xs flex items-center gap-4">
                            <Globe size={11} /> {meta.language.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="text-xs">{formatDate(att.createdAt)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-muted" style={{ padding: 40 }}>
                    아직 데이터가 없습니다. Attest 페이지에서 첫 번째 데이터를 등록해보세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
