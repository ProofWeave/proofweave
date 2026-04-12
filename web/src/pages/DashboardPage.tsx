import { useState, useEffect } from 'react';
import { FileCheck, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';

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
}

interface SearchResponse {
  count: number;
  attestations: AttestationRow[];
}

export function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, myData: 0 });
  const [recent, setRecent] = useState<AttestationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<SearchResponse>('/search?limit=10');
        setRecent(data.attestations || []);
        setStats({ total: data.count || 0, myData: data.count || 0 });
      } catch (err) {
        console.warn('[Dashboard] fetch failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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
          value="0"
          icon={<ShoppingCart size={20} />}
          color="green"
          loading={loading}
        />
        <KpiCard
          title="Cost Saved"
          value="$0"
          icon={<DollarSign size={20} />}
          color="amber"
          loading={loading}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">최근 Attestations</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Hash</th>
                <th>Creator</th>
                <th>Model</th>
                <th>Date</th>
                <th>Tx</th>
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
                recent.map((att) => (
                  <tr key={att.attestationId}>
                    <td className="mono" title={att.contentHash}>
                      {truncateHash(att.contentHash)}
                    </td>
                    <td className="mono" title={att.creator}>
                      {truncateHash(att.creator)}
                    </td>
                    <td>
                      <span className="badge badge-purple">{att.aiModel}</span>
                    </td>
                    <td className="text-xs">{formatDate(att.createdAt)}</td>
                    <td>
                      <a
                        href={`https://sepolia.basescan.org/tx/${att.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="badge badge-info"
                        style={{ textDecoration: 'none' }}
                      >
                        Tx ↗
                      </a>
                    </td>
                  </tr>
                ))
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
