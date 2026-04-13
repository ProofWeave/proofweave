import { Activity, FileCheck2, ShieldCheck, Timer } from 'lucide-react';

interface Props {
  total: number;
  last24h: number;
  verifiedRatio: number;
  verificationRuns: number;
  loading?: boolean;
}

function Card({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'purple' | 'cyan' | 'green' | 'amber';
  loading?: boolean;
}) {
  return (
    <div className={`card kpi-card ${color}`}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        <div className={`kpi-icon ${color}`}>{icon}</div>
      </div>
      <div className="card-value">
        {loading ? <div className="skeleton" style={{ width: 72, height: 32 }} /> : value}
      </div>
    </div>
  );
}

export function KpiCards({
  total,
  last24h,
  verifiedRatio,
  verificationRuns,
  loading,
}: Props) {
  return (
    <div className="bento-grid">
      <Card
        title="Total Attestations"
        value={total.toLocaleString()}
        icon={<FileCheck2 size={20} />}
        color="purple"
        loading={loading}
      />
      <Card
        title="Last 24h"
        value={last24h.toLocaleString()}
        icon={<Timer size={20} />}
        color="cyan"
        loading={loading}
      />
      <Card
        title="Verified Ratio"
        value={`${verifiedRatio.toFixed(1)}%`}
        icon={<ShieldCheck size={20} />}
        color="green"
        loading={loading}
      />
      <Card
        title="Verification Runs"
        value={verificationRuns.toLocaleString()}
        icon={<Activity size={20} />}
        color="amber"
        loading={loading}
      />
    </div>
  );
}
