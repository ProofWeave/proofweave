import { FileCheck, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  change?: string;
  changeUp?: boolean;
  color: 'purple' | 'cyan' | 'green' | 'amber';
}

function KpiCard({ title, value, icon, change, changeUp, color }: KpiCardProps) {
  return (
    <div className={`card kpi-card ${color}`}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        <div className={`kpi-icon ${color}`}>{icon}</div>
      </div>
      <div className="card-value">{value}</div>
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

export function DashboardPage() {
  // TODO: API에서 stats 가져오기. 지금은 placeholder
  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>ProofWeave 전체 현황을 한눈에</p>
      </div>

      <div className="bento-grid">
        <KpiCard
          title="Total Attestations"
          value="—"
          icon={<FileCheck size={20} />}
          color="purple"
        />
        <KpiCard
          title="My Data"
          value="—"
          icon={<TrendingUp size={20} />}
          color="cyan"
        />
        <KpiCard
          title="Purchases"
          value="—"
          icon={<ShoppingCart size={20} />}
          color="green"
        />
        <KpiCard
          title="Cost Saved"
          value="—"
          icon={<DollarSign size={20} />}
          color="amber"
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="text-center text-muted" style={{ padding: '40px' }}>
                  아직 데이터가 없습니다. Attest 페이지에서 첫 번째 데이터를 등록해보세요.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
