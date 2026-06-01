import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-core';
import GlobeCanvas from '../components/landing/GlobeCanvas';
import '../styles/landing.css';

/* Placeholder marketplace showcase from the design bundle. These are
   illustrative dataset examples, NOT live ProofWeave listings — wire to real
   featured attestations during the Explorer pass (Part 2). */
const SAMPLE_DATASETS = [
  { cat: 'Geospatial', name: 'Global Maritime AIS Vectors', rec: '320M', fmt: 'GeoParquet', price: '4,200', per: '/mo' },
  { cat: 'Environmental', name: 'Urban Air Quality — APAC Grid', rec: '18.4M', fmt: 'NetCDF', price: '880', per: '/mo' },
  { cat: 'Commerce', name: 'Anonymized Retail POS Streams', rec: '1.1B', fmt: 'Avro', price: '6,500', per: '/mo' },
  { cat: 'Bio', name: 'Genomic Variant Annotations v9', rec: '47M', fmt: 'VCF', price: '12,000', per: '/yr' },
  { cat: 'Geospatial', name: 'Satellite NDVI Tiles — 2020-26', rec: '2.9M', fmt: 'COG', price: '1,450', per: '/mo' },
  { cat: 'Financial', name: 'On-chain DeFi Liquidity Events', rec: '210M', fmt: 'Parquet', price: '3,100', per: '/mo' },
];

/* Seeded sparklines (ported from the design) — deterministic per card so they
   stay stable across re-renders. Each returns SVG inner markup. */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function mkRng(s: number) {
  let x = (s * 9301 + 49297) % 233280;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}
function chartLine(seed: number) {
  const r = mkRng(seed), n = 28, pts: string[] = [];
  let v = 14 + r() * 6;
  for (let i = 0; i < n; i++) { v += (r() - 0.38) * 4; v = clamp(v, 5, 35); pts.push((i / (n - 1) * 100).toFixed(1) + ',' + (40 - v).toFixed(1)); }
  return `<polyline points="0,40 ${pts.join(' ')} 100,40" fill="rgba(116,190,180,0.10)" stroke="none"/><polyline points="${pts.join(' ')}" fill="none" stroke="#74BEB4" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
}
function chartBars(seed: number) {
  const r = mkRng(seed), n = 18, gap = 100 / n, bw = gap * 0.6;
  let out = '';
  for (let i = 0; i < n; i++) { const h = 5 + r() * 31; out += `<rect x="${(i * gap + (gap - bw) / 2).toFixed(1)}" y="${(40 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${i % 5 === 4 ? '#22D3EE' : '#52ADA1'}" opacity="0.85"/>`; }
  return out;
}
function chartStep(seed: number) {
  const r = mkRng(seed), n = 12;
  let v = 18 + r() * 6;
  const pts: string[] = ['0,' + (40 - v).toFixed(1)];
  for (let i = 1; i <= n; i++) { const nx = (i / n * 100).toFixed(1); pts.push(nx + ',' + (40 - v).toFixed(1)); v += (r() - 0.4) * 9; v = clamp(v, 6, 34); pts.push(nx + ',' + (40 - v).toFixed(1)); }
  return `<polyline points="0,40 ${pts.join(' ')} 100,40" fill="rgba(151,206,199,0.08)" stroke="none"/><polyline points="${pts.join(' ')}" fill="none" stroke="#97CEC7" stroke-width="1.3" vector-effect="non-scaling-stroke"/>`;
}
function chartBand(seed: number) {
  const r = mkRng(seed), n = 24, up: string[] = [], lo: string[] = [], mid: string[] = [];
  let v = 20;
  for (let i = 0; i < n; i++) { v += (r() - 0.45) * 4; v = clamp(v, 9, 31); const sp = 3 + r() * 5, cx = (i / (n - 1) * 100).toFixed(1); up.push(cx + ',' + (40 - (v + sp)).toFixed(1)); lo.push(cx + ',' + (40 - (v - sp)).toFixed(1)); mid.push(cx + ',' + (40 - v).toFixed(1)); }
  return `<polygon points="${up.concat(lo.reverse()).join(' ')}" fill="rgba(116,190,180,0.14)" stroke="none"/><polyline points="${mid.join(' ')}" fill="none" stroke="#97CEC7" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
}
function chartWave(seed: number) {
  const r = mkRng(seed), n = 44, pts: string[] = [], ph = r() * 6;
  for (let i = 0; i < n; i++) { let v = 20 + Math.sin(i / n * Math.PI * 4 + ph) * 10 * (0.55 + 0.45 * r()); v = clamp(v, 5, 35); pts.push((i / (n - 1) * 100).toFixed(1) + ',' + (40 - v).toFixed(1)); }
  return `<polyline points="0,40 ${pts.join(' ')} 100,40" fill="rgba(34,211,238,0.07)" stroke="none"/><polyline points="${pts.join(' ')}" fill="none" stroke="#74BEB4" stroke-width="1.3" vector-effect="non-scaling-stroke"/>`;
}
function chartCandle(seed: number) {
  const r = mkRng(seed), n = 11, gap = 100 / n, bw = gap * 0.42;
  let c = 20, out = '';
  for (let i = 0; i < n; i++) {
    const o = c, cl = clamp(c + (r() - 0.5) * 11, 6, 34), hi = Math.max(o, cl) + r() * 4, lo = Math.min(o, cl) - r() * 4, cx = i * gap + gap / 2, color = cl >= o ? '#22D3EE' : '#418B81';
    out += `<line x1="${cx.toFixed(1)}" y1="${(40 - hi).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(40 - lo).toFixed(1)}" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(40 - Math.max(o, cl)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, Math.abs(cl - o)).toFixed(1)}" fill="${color}"/>`;
    c = cl;
  }
  return out;
}
const CHARTS = [chartStep, chartBars, chartLine, chartBand, chartWave, chartCandle];

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // keep the viewport dark while the landing is mounted (no warm-theme flash)
  useEffect(() => {
    document.documentElement.classList.add('pw-land-active');
    return () => document.documentElement.classList.remove('pw-land-active');
  }, []);

  const enterApp = () => navigate(user ? '/dashboard' : '/login');

  return (
    <div className="pw-land">
      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav__in">
          <a className="brand" href="#top"><span className="brand__mark" />ProofWeave</a>
          <div className="nav__links">
            <span className="nav__set" style={{ display: 'flex', gap: 'var(--s5)', alignItems: 'center' }}>
              <a href="#how">How it works</a>
              <a href="#market">Marketplace</a>
            </span>
            <button className="btn btn--primary" onClick={enterApp}>{user ? '대시보드' : '시작하기'}</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="hero" id="top">
        <GlobeCanvas />
        <div className="hero__in">
          <div className="hero__grid">
            <div className="hero__copy">
              <span className="eyebrow">ProofWeave · Data Provenance Network</span>
              <h1>검증 가능한<br />데이터의 <span className="accent">마켓플레이스</span></h1>
              <div className="hero__en">The Marketplace for Verifiable Data</div>
              <p className="hero__sub">
                데이터를 등록하고, 출처를 증명하고, 신뢰할 수 있는 거래로 연결합니다.
              </p>
              <div className="hero__cta">
                <button className="btn btn--primary" onClick={enterApp}>데이터 등록하기 →</button>
                <a className="btn btn--ghost" href="#market">마켓플레이스 둘러보기</a>
              </div>
              <div className="hero__stats">
                <div className="hero__stat"><div className="n">On-chain</div><div className="l">Provenance proof</div></div>
                <div className="hero__stat"><div className="n">E2E</div><div className="l">Encrypted access</div></div>
                <div className="hero__stat"><div className="n">x402</div><div className="l">USDC payments</div></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── HOW IT WORKS ── */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section__head">
            <span className="eyebrow">How it works</span>
            <h2>등록에서 거래까지, 세 단계</h2>
            <p>모든 데이터는 동일한 증명 파이프라인을 통과합니다 — 출처가 증명되지 않은 데이터는 거래되지 않습니다.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step__n">01</div>
              <svg className="step__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <h3>등록<span className="en">Register</span></h3>
              <p>AI 분석 결과를 업로드하면 콘텐츠 해시와 메타데이터가 온체인 어테스테이션으로 기록됩니다.</p>
            </div>
            <div className="step">
              <div className="step__n">02</div>
              <svg className="step__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" />
              </svg>
              <h3>검증<span className="en">Verify</span></h3>
              <p>누구나 온체인 기록과 콘텐츠 해시를 대조해 출처·무결성·소유권을 검증할 수 있습니다.</p>
            </div>
            <div className="step">
              <div className="step__n">03</div>
              <svg className="step__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h13" /><path d="M14 5l3 3-3 3" /><path d="M20 16H7" /><path d="M10 13l-3 3 3 3" />
              </svg>
              <h3>거래<span className="en">Trade</span></h3>
              <p>검증된 데이터를 마켓플레이스에 게시하고 x402·USDC로 접근 권한을 안전하게 거래합니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARKETPLACE ── */}
      <section className="section" id="market">
        <div className="wrap">
          <div className="market__head">
            <div className="section__head" style={{ marginBottom: 0 }}>
              <span className="eyebrow">Marketplace</span>
              <h2>출처가 검증된 데이터셋</h2>
              <p>모든 항목은 게시 전 온체인 출처가 검증됩니다.</p>
            </div>
            <button className="btn btn--ghost" onClick={enterApp}>전체 보기 →</button>
          </div>

          <div className="cards">
            {SAMPLE_DATASETS.map((d, i) => (
              <div className="card" key={d.name}>
                <div className="card__top">
                  <span className="tag">{d.cat}</span>
                  <span className="verified">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#97CEC7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" />
                    </svg>
                    Verified
                  </span>
                </div>
                <h4>{d.name}</h4>
                <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" dangerouslySetInnerHTML={{ __html: CHARTS[i % CHARTS.length](i * 17 + 5) }} />
                <div className="card__meta">
                  <div>Records<b>{d.rec}</b></div>
                  <div>Format<b>{d.fmt}</b></div>
                </div>
                <div className="card__foot">
                  <span className="price">${d.price} <span>{d.per}</span></span>
                  <button className="card__view" onClick={enterApp}>View →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="foot">
        <div className="wrap foot__in">
          <a className="brand" href="#top"><span className="brand__mark" /> ProofWeave</a>
          <div className="foot__links">
            <a href="#how">How it works</a>
            <a href="#market">Marketplace</a>
          </div>
          <small>© 2026 ProofWeave · Verifiable Data Network</small>
        </div>
      </footer>
    </div>
  );
}
