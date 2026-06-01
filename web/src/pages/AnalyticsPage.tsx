import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCheck, ShoppingCart, Coins, ArrowUpRight, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { MyDataSection } from '../components/MyDataSection';

// ── Types ────────────────────────────────────────────────────

interface MyStats {
  totalPurchases: number;
  totalSpentUsdMicros: number;
  totalAttestations: number;
}
interface ClaimSummary {
  db: { grossEarnedUsdMicros: string; paymentCount: number };
  onchain: { claimableBaseUnits: string | null };
}
interface PurchaseRow {
  attestationId: string;
  amountUsdMicros: number;
  paymentMethod: string;
  txHash: string | null;
  createdAt: string;
}

type Tab = 'registered' | 'purchased';

const BASESCAN_TX = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`;
const fmtUsd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
const fmtClaimable = (base: string | null) =>
  base == null ? '—' : `$${(Number(base) / 1_000_000).toFixed(2)}`;
const truncate = (v: string) => (v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v);
const fmtDate = (v: string) => {
  try {
    return new Date(v).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return v;
  }
};

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('registered');
  const [stats, setStats] = useState<MyStats | null>(null);
  const [claim, setClaim] = useState<ClaimSummary | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsData, claimData, purchaseData] = await Promise.all([
          api.get<MyStats>('/stats/me').catch(() => null),
          api.get<ClaimSummary>('/claims/me').catch(() => null),
          api.get<{ purchases: PurchaseRow[] }>('/purchases/history').catch(() => ({ purchases: [] })),
        ]);
        if (cancelled) return;
        setStats(statsData);
        setClaim(claimData);
        setPurchases(purchaseData.purchases || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const claimable = claim?.onchain.claimableBaseUnits ?? null;

  const tiles = [
    { key: 'reg', icon: FileCheck, label: '내가 등록한 데이터', value: stats ? `${stats.totalAttestations}` : '—', unit: '건', to: null },
    { key: 'buy', icon: ShoppingCart, label: '내가 구매한 데이터', value: stats ? `${stats.totalPurchases}` : '—', sub: stats ? `${fmtUsd(stats.totalSpentUsdMicros)} 지출` : undefined, to: null },
    { key: 'earn', icon: Coins, label: '누적 수익 (DB)', value: claim ? fmtUsd(Number(claim.db.grossEarnedUsdMicros)) : '—', sub: claim ? `결제 ${claim.db.paymentCount}건` : undefined, to: '/claims' },
    { key: 'claim', icon: ArrowUpRight, label: '청구 가능 (on-chain)', value: fmtClaimable(claimable), accent: true, to: '/claims' },
  ];

  return (
    <>
      <div className="page-header">
        <h2>Activity</h2>
        <p>내가 등록·구매한 데이터와 수익 — 원장에 기록된 활동 내역</p>
      </div>

      {/* Summary tiles (provable, ledger-backed) */}
      <div className="flow-strip">
        {tiles.map(({ key, icon: Icon, label, value, unit, sub, accent, to }) => (
          <button
            key={key}
            className={`flow-tile ${accent ? 'flow-tile--accent' : ''}`}
            onClick={() => to && navigate(to)}
            style={{ cursor: to ? 'pointer' : 'default' }}
          >
            <div className="flow-tile__head">
              <Icon size={15} />
              <span>{label}</span>
              {to && <ArrowUpRight size={13} className="flow-tile__go" />}
            </div>
            <div className="flow-tile__value">
              {loading ? <span className="skeleton" style={{ width: 56, height: 22, display: 'inline-block' }} /> : value}
              {unit && !loading && <span className="flow-tile__unit"> {unit}</span>}
            </div>
            {sub && !loading && <div className="flow-tile__sub">{sub}</div>}
          </button>
        ))}
      </div>

      {/* Tabbed activity tables */}
      <div className="card">
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab ${tab === 'registered' ? 'active' : ''}`} onClick={() => setTab('registered')}>
            내가 등록한 데이터
          </button>
          <button className={`tab ${tab === 'purchased' ? 'active' : ''}`} onClick={() => setTab('purchased')}>
            내가 구매한 데이터 {purchases.length > 0 && `(${purchases.length})`}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <span className="spinner" /> <span className="text-muted ml-8">불러오는 중...</span>
          </div>
        ) : tab === 'registered' ? (
          <MyDataSection />
        ) : purchases.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Attestation</th><th>금액</th><th>결제</th><th>Date</th><th>Tx</th></tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr
                    key={`${p.attestationId}-${p.createdAt}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/explorer?q=${encodeURIComponent(p.attestationId)}`)}
                  >
                    <td className="mono text-xs">{truncate(p.attestationId)}</td>
                    <td className="mono text-xs">{fmtUsd(p.amountUsdMicros)}</td>
                    <td className="text-xs">{p.paymentMethod}</td>
                    <td className="text-xs">{fmtDate(p.createdAt)}</td>
                    <td>
                      {p.txHash && (
                        <a
                          href={BASESCAN_TX(p.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="link-cyan text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} /> Tx
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 28 }}>
            <h3 style={{ marginBottom: 8 }}>아직 구매한 데이터가 없습니다</h3>
            <p style={{ marginBottom: 12 }}>Explorer에서 검증된 데이터를 찾아 구매해보세요.</p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/explorer')}>Explorer 열기</button>
          </div>
        )}
      </div>
    </>
  );
}
