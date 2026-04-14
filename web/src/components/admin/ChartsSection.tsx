import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import type { AttestationRow } from '../../types/admin';

interface Props {
  rows: AttestationRow[];
}

const COLORS = ['#8B5CF6', '#22D3EE', '#10B981', '#F59E0B', '#EF4444'];

export function ChartsSection({ rows }: Props) {
  const byDate = new Map<string, number>();
  const byModel = new Map<string, number>();

  rows.forEach((row) => {
    const dateKey = new Date(row.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + 1);
    const modelKey = row.aiModel || 'unknown';
    byModel.set(modelKey, (byModel.get(modelKey) || 0) + 1);
  });

  const trendData = Array.from(byDate.entries()).map(([date, count]) => ({ date, count }));
  const modelData = Array.from(byModel.entries()).map(([name, value]) => ({ name, value }));

  return (
    <div className="admin-chart-grid">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Attestation Trend</span>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27304A" />
              <XAxis dataKey="date" stroke="#8F9BB7" fontSize={12} />
              <YAxis stroke="#8F9BB7" fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Model Distribution</span>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={modelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {modelData.map((entry, idx) => (
                  <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
