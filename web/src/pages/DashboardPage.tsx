import { useState, useEffect } from 'react';
import { Cpu, Globe, ChevronsDown } from 'lucide-react';
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

// ── Domain color/label map ──────────────────────────────────

const DOMAIN_CONFIG: DomainConfig = {
  defi:            { label: 'DeFi',           color: 'var(--accent-purple)' },
  smart_contract:  { label: 'Smart Contract', color: 'var(--accent-cyan)' },
  security:        { label: 'Security',       color: 'var(--accent-red)' },
  legal:           { label: 'Legal',          color: 'var(--accent-amber)' },
  data_analysis:   { label: 'Data Analysis',  color: 'var(--accent-green)' },
  infrastructure:  { label: 'Infra',          color: '#7C6F64' },
  blockchain:      { label: 'Blockchain',     color: '#6A5ACD' },
  cryptocurrency:  { label: 'Crypto',         color: '#CD853F' },
  nft:             { label: 'NFT',            color: '#DA70D6' },
  dao:             { label: 'DAO',            color: '#20B2AA' },
  ai_ml:           { label: 'AI/ML',          color: '#4682B4' },
  data_science:    { label: 'Data Sci.',      color: '#3CB371' },
  web3:            { label: 'Web3',           color: '#9370DB' },
  economics:       { label: 'Economics',      color: '#D2691E' },
  education:       { label: 'Education',      color: '#5F9EA0' },
  health:          { label: 'Health',         color: '#E9967A' },
  science:         { label: 'Science',        color: '#8FBC8F' },
  technology:      { label: 'Technology',     color: '#778899' },
  general:         { label: 'General',        color: '#A0938F' },
};

const TIMELINE_DAYS = 30;

// ── Component ───────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<AttestationRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [searchData, timelineData] = await Promise.all([
          api.get<SearchResponse>('/search?limit=10'),
          api.get<TimelineResponse>(`/stats/timeline?days=${TIMELINE_DAYS}`).catch(() => null),
        ]);

        setRecent(searchData.attestations || []);
        setTimeline(timelineData);
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
      </div>

      {/* Attestation Timeline (30 days, stacked by domain) */}
      <div className="card mb-24">
        <div className="card-header">
          <span className="card-title">Attestation 추이 ({TIMELINE_DAYS}일)</span>
        </div>
        {loading && !timeline ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton" style={{ width: '100%', height: 180 }} />
          </div>
        ) : (
          <DomainTimeline data={timeline} dconfig={DOMAIN_CONFIG} days={TIMELINE_DAYS} />
        )}
      </div>

      {/* Recent Attestations — with metadata */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">최근 Attestations</span>
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
        {recent.length > 0 && (
          <div
            onClick={() => navigate('/explorer')}
            style={{
              textAlign: 'center',
              padding: '12px 0 8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { (e.target as HTMLDivElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { (e.target as HTMLDivElement).style.color = 'var(--text-muted)'; }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: '0.72rem' }}>Explorer에서 더보기</span>
              <ChevronsDown size={22} style={{ animation: 'bounce-down 1.2s ease-in-out infinite' }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
