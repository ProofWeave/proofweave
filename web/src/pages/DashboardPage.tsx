import { useState, useEffect } from 'react';
import { Cpu, Globe, FileCheck, ShoppingCart, Coins, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { AttestationMetadataView } from '../components/AttestationCard';
import { DomainTimeline, type DomainConfig, type TimelineResponse } from '../components/DomainTimeline';

// ── Types ────────────────────────────────────────────────────

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

interface MyStats {
  totalPurchases: number;
  totalSpentUsdMicros: number;
  totalAttestations: number;
}

interface ClaimSummary {
  db: { grossEarnedUsdMicros: string; paymentCount: number };
  onchain: { claimableBaseUnits: string | null; available?: boolean };
}

// ── Domain color/label map (slate + cyan ramp) ──────────────

const RAMP = [
  '#22D3EE', '#74BEB4', '#97CEC7', '#5FD7E0', '#3FB7C7', '#56C596',
  '#F59E0B', '#4682B4', '#9370DB', '#52ADA1', '#2E94A8', '#7FD7CC',
];
const DOMAIN_KEYS = [
  'defi', 'smart_contract', 'security', 'legal', 'data_analysis', 'infrastructure',
  'blockchain', 'cryptocurrency', 'nft', 'dao', 'ai_ml', 'data_science',
  'web3', 'economics', 'education', 'health', 'science', 'technology', 'general',
] as const;
const DOMAIN_LABELS: Record<string, string> = {
  defi: 'DeFi', smart_contract: 'Smart Contract', security: 'Security', legal: 'Legal',
  data_analysis: 'Data Analysis', infrastructure: 'Infra', blockchain: 'Blockchain',
  cryptocurrency: 'Crypto', nft: 'NFT', dao: 'DAO', ai_ml: 'AI/ML', data_science: 'Data Sci.',
  web3: 'Web3', economics: 'Economics', education: 'Education', health: 'Health',
  science: 'Science', technology: 'Technology', general: 'General',
};
const DOMAIN_CONFIG: DomainConfig = Object.fromEntries(
  DOMAIN_KEYS.map((k, i) => [k, { label: DOMAIN_LABELS[k], color: RAMP[i % RAMP.length] }]),
);

const TIMELINE_DAYS = 30;

const fmtUsd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
const fmtClaimable = (base: string | null) =>
  base == null ? '—' : `$${(Number(base) / 1_000_000).toFixed(2)}`;

// ── Component ───────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<AttestationRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [claim, setClaim] = useState<ClaimSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [searchData, timelineData, statsData, claimData] = await Promise.all([
          api.get<SearchResponse>('/search?limit=8'),
          api.get<TimelineResponse>(`/stats/timeline?days=${TIMELINE_DAYS}`).catch(() => null),
          api.get<MyStats>('/stats/me').catch(() => null),
          api.get<ClaimSummary>('/claims/me').catch(() => null),
        ]);
        setRecent(searchData.attestations || []);
        setTimeline(timelineData);
        setStats(statsData);
        setClaim(claimData);
      } catch (err) {
        console.warn('[Dashboard] fetch failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const goToRow = (att: AttestationRow) => {
    const dom = att.metadata?.domain;
    navigate(dom ? `/explorer?domain=${encodeURIComponent(dom)}` : `/explorer?q=${encodeURIComponent(att.contentHash)}`);
  };

  const claimable = claim?.onchain.claimableBaseUnits ?? null;

  const tiles = [
    {
      key: 'attest', icon: FileCheck, label: '내가 등록한 데이터',
      value: stats ? String(stats.totalAttestations) : '—', unit: '건',
      to: '/explorer',
    },
    {
      key: 'purchases', icon: ShoppingCart, label: '내가 구매한 데이터',
      value: stats ? String(stats.totalPurchases) : '—',
      sub: stats ? `${fmtUsd(stats.totalSpentUsdMicros)} 지출` : undefined,
      to: '/analytics',
    },
    {
      key: 'earned', icon: Coins, label: '누적 수익 (DB)',
      value: claim ? fmtUsd(Number(claim.db.grossEarnedUsdMicros)) : '—',
      sub: claim ? `결제 ${claim.db.paymentCount}건` : undefined,
      to: '/claims',
    },
    {
      key: 'claimable', icon: ArrowUpRight, label: '청구 가능 (on-chain)',
      value: fmtClaimable(claimable),
      accent: true,
      to: '/claims',
    },
  ];

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>등록 · 거래 · 수익으로 이어지는 내 활동 흐름</p>
      </div>

      {/* Flow strip — Attest → Explore → Purchase → Earn */}
      <div className="flow-strip">
        {tiles.map(({ key, icon: Icon, label, value, unit, sub, accent, to }) => (
          <button
            key={key}
            className={`flow-tile ${accent ? 'flow-tile--accent' : ''}`}
            onClick={() => navigate(to)}
          >
            <div className="flow-tile__head">
              <Icon size={15} />
              <span>{label}</span>
              <ArrowUpRight size={13} className="flow-tile__go" />
            </div>
            <div className="flow-tile__value">
              {loading ? <span className="skeleton" style={{ width: 56, height: 22, display: 'inline-block' }} /> : value}
              {unit && !loading && <span className="flow-tile__unit"> {unit}</span>}
            </div>
            {sub && !loading && <div className="flow-tile__sub">{sub}</div>}
          </button>
        ))}
      </div>

      {/* Attestation Timeline (30 days, stacked by domain) */}
      <div className="card mb-24">
        <div className="card-header">
          <span className="card-title">Attestation 추이 ({TIMELINE_DAYS}일)</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/explorer')}>
            Explorer 열기
          </button>
        </div>
        {loading && !timeline ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton" style={{ width: '100%', height: 180 }} />
          </div>
        ) : (
          <DomainTimeline data={timeline} dconfig={DOMAIN_CONFIG} days={TIMELINE_DAYS} />
        )}
      </div>

      {/* Recent Attestations */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">최근 Attestations</span>
          {recent.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/explorer')}>
              전체 보기
            </button>
          )}
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
                    <div className="flex items-center gap-12" style={{ justifyContent: 'center' }}>
                      <span className="spinner" /> 로딩 중...
                    </div>
                  </td>
                </tr>
              ) : recent.length > 0 ? (
                recent.map((att) => {
                  const meta = att.metadata;
                  const hasTitle = meta?.metadataStatus === 'ready' && meta?.title;
                  return (
                    <tr key={att.attestationId} style={{ cursor: 'pointer' }} onClick={() => goToRow(att)}>
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
                          <span className="badge badge-purple text-xs">
                            {DOMAIN_CONFIG[meta.domain]?.label || meta.domain}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-purple text-xs">
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
                  <td colSpan={5} className="text-center text-muted" style={{ padding: 32 }}>
                    <div style={{ marginBottom: 12 }}>아직 등록된 데이터가 없습니다.</div>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/attest')}>
                      <FileCheck size={14} /> 첫 데이터 등록하기
                    </button>
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
