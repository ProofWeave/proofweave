import { useState, useMemo } from 'react';

export interface DomainConfigEntry {
  label: string;
  color: string;
}

export type DomainConfig = Record<string, DomainConfigEntry>;

export interface TimelineResponse {
  days: number;
  buckets: Record<string, Record<string, number>>;
}

interface DomainTimelineProps {
  data: TimelineResponse | null;
  dconfig: DomainConfig;
  days?: number;
}

interface TooltipLayer {
  dom: string;
  value: number;
  y0: number;
  y1: number;
}

interface TooltipState {
  date: string;
  x: number;
  totalDaily: number;
  totalCumul: number;
  daily: TooltipLayer[];
  cumul: TooltipLayer[];
}

const W = 560;
const H = 220;
const PAD = { top: 20, right: 38, bottom: 36, left: 52 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

const FALLBACK_CFG: DomainConfigEntry = { label: 'Unknown', color: 'var(--text-muted)' };

/** Monotone cubic interpolation — prevents overshoot/undershoot */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return '';
  const n = pts.length;
  // compute slopes
  const dxs: number[] = [];
  const dys: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dxs.push(pts[i + 1].x - pts[i].x);
    dys.push(pts[i + 1].y - pts[i].y);
    ms.push(dys[i] / dxs[i]);
  }
  const ds: number[] = [ms[0]];
  for (let i = 1; i < n - 1; i++) {
    if (ms[i - 1] * ms[i] <= 0) {
      ds.push(0);
    } else {
      ds.push((ms[i - 1] + ms[i]) / 2);
    }
  }
  ds.push(ms[n - 2]);
  // build path
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const dx3 = dxs[i] / 3;
    d += ` C${pts[i].x + dx3},${pts[i].y + ds[i] * dx3} ${pts[i + 1].x - dx3},${pts[i + 1].y - ds[i + 1] * dx3} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

function formatLabel(dateStr: string): string {
  const dt = new Date(dateStr + 'T00:00:00Z');
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
}

export function DomainTimeline({ data, dconfig, days = 30 }: DomainTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hiddenDomains, setHiddenDomains] = useState<Set<string>>(new Set());

  const toggleDomain = (dom: string) => {
    setHiddenDomains((prev) => {
      const next = new Set(prev);
      if (next.has(dom)) next.delete(dom);
      else next.add(dom);
      return next;
    });
  };

  const computed = useMemo(() => {
    const buckets = data?.buckets ?? {};

    // Build date range anchored at today (UTC), filling missing days with 0.
    const allDates: string[] = [];
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() - i);
      allDates.push(d.toISOString().slice(0, 10));
    }

    const domainSet = new Set<string>();
    for (const day of Object.keys(buckets)) {
      for (const dom of Object.keys(buckets[day])) domainSet.add(dom);
    }
    // Ensure configured domains are present in legend even if count is 0.
    for (const dom of Object.keys(dconfig)) domainSet.add(dom);
    // configured domains만 포함 (unknown 등 미등록 도메인 제외), 숨겨진 도메인 필터링
    const domList = [...domainSet].filter((dom) => dom in dconfig && !hiddenDomains.has(dom));
    const allDomList = [...domainSet].filter((dom) => dom in dconfig);

    const dailyData = allDates.map((date) => {
      let y0 = 0;
      const layers: TooltipLayer[] = domList.map((dom) => {
        const v = buckets[date]?.[dom] ?? 0;
        const layer = { dom, y0, y1: y0 + v, value: v };
        y0 += v;
        return layer;
      });
      return { date, layers, total: y0 };
    });
    const maxDaily = Math.max(...dailyData.map((s) => s.total), 1);

    const cumul: Record<string, number> = {};
    domList.forEach((d) => { cumul[d] = 0; });
    const cumulData = allDates.map((date) => {
      domList.forEach((dom) => {
        cumul[dom] += buckets[date]?.[dom] ?? 0;
      });
      let y0 = 0;
      const layers: TooltipLayer[] = domList.map((dom) => {
        const v = cumul[dom];
        const layer = { dom, y0, y1: y0 + v, value: v };
        y0 += v;
        return layer;
      });
      return { date, layers, total: y0 };
    });
    const maxCumul = Math.max(...cumulData.map((s) => s.total), 1);

    return { allDates, domList, allDomList, dailyData, cumulData, maxDaily, maxCumul };
  }, [data, dconfig, days, hiddenDomains]);

  const { allDates, domList, allDomList, dailyData, cumulData, maxDaily, maxCumul } = computed;
  const isEmpty = dailyData.every((s) => s.total === 0);

  const xPos = (i: number) => PAD.left + ((i + 0.5) / allDates.length) * IW;
  const yDaily = (v: number) => PAD.top + IH - (v / maxDaily) * IH;
  const yCumul = (v: number) => PAD.top + IH - (v / maxCumul) * IH;
  const barW = Math.max((IW / allDates.length) * 0.6, 2);

  const cumulAreas = domList.map((dom, di) => {
    const topPts = cumulData.map((s, i) => ({ x: xPos(i), y: yCumul(s.layers[di].y1) }));
    const botPts = cumulData.map((s, i) => ({ x: xPos(i), y: yCumul(s.layers[di].y0) }));
    const topLine = smoothPath(topPts);
    const botRev = [...botPts].reverse();
    const botLine = smoothPath(botRev);
    const area = topLine + ' L' + botRev[0].x + ',' + botRev[0].y + ' ' + botLine.slice(1) + ' Z';
    const cfg = dconfig[dom] ?? FALLBACK_CFG;
    return { dom, area, topPts, cfg };
  });

  const dailyTicks = [0, 1, 2, 3, 4].map((i) => Math.round((maxDaily / 4) * i));
  const cumulTicks = [0, 1, 2, 3, 4].map((i) => Math.round((maxCumul / 4) * i));
  const labelInterval = Math.max(Math.floor(allDates.length / 6), 1);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto' }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          {domList.map((dom) => {
            const cfg = dconfig[dom] ?? FALLBACK_CFG;
            return (
              <linearGradient key={dom} id={`tl-grad-${dom}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cfg.color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={cfg.color} stopOpacity={0.03} />
              </linearGradient>
            );
          })}
        </defs>

        {dailyTicks.map((val, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yDaily(val)}
              y2={yDaily(val)}
              stroke="var(--border-subtle)"
              strokeDasharray="3,3"
              strokeWidth={0.5}
            />
            <text
              x={PAD.left - 8}
              y={yDaily(val) + 3}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize={8}
              fontFamily="var(--font-mono)"
            >
              {val}
            </text>
          </g>
        ))}

        {cumulTicks.map((val, i) => (
          <text
            key={`cumul-tick-${i}`}
            x={W - PAD.right + 8}
            y={yCumul(val) + 3}
            textAnchor="start"
            fill="var(--text-muted)"
            fontSize={8}
            fontFamily="var(--font-mono)"
            opacity={0.5}
          >
            {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
          </text>
        ))}

        {cumulAreas.map(({ dom, area }) => (
          <path key={`${dom}-area`} d={area} fill={`url(#tl-grad-${dom})`} />
        ))}

        {cumulAreas.map(({ dom, topPts, cfg }) => (
          <path
            key={`${dom}-cline`}
            d={smoothPath(topPts)}
            fill="none"
            stroke={cfg.color}
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.3}
            strokeDasharray="4,3"
          />
        ))}

        {dailyData.map((s, i) => (
          <g key={s.date}>
            {s.layers.filter((l) => l.value > 0).map((l) => {
              const cfg = dconfig[l.dom] ?? FALLBACK_CFG;
              return (
                <rect
                  key={l.dom}
                  x={xPos(i) - barW / 2}
                  y={yDaily(l.y1)}
                  width={barW}
                  height={Math.max(yDaily(l.y0) - yDaily(l.y1), 0.5)}
                  fill={cfg.color}
                  rx={1}
                  opacity={0.85}
                />
              );
            })}
          </g>
        ))}

        {dailyData.map((s, i) => (
          <rect
            key={`hover-${s.date}`}
            x={xPos(i) - IW / allDates.length / 2}
            y={PAD.top}
            width={IW / allDates.length}
            height={IH}
            fill="transparent"
            onMouseEnter={() =>
              setTooltip({
                date: s.date,
                x: xPos(i),
                totalDaily: s.total,
                totalCumul: cumulData[i].total,
                daily: s.layers,
                cumul: cumulData[i].layers,
              })
            }
          />
        ))}

        {tooltip && (
          <line
            x1={tooltip.x}
            x2={tooltip.x}
            y1={PAD.top}
            y2={PAD.top + IH}
            stroke="var(--text-muted)"
            strokeWidth={0.5}
            strokeDasharray="3,2"
            opacity={0.4}
          />
        )}

        {allDates.map((d, i) =>
          i % labelInterval === 0 || i === allDates.length - 1 ? (
            <text
              key={d}
              x={xPos(i)}
              y={H - 8}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={8}
              fontFamily="var(--font-mono)"
            >
              {formatLabel(d)}
            </text>
          ) : null,
        )}

        <text
          x={PAD.left - 6}
          y={PAD.top - 6}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize={7}
          fontFamily="var(--font-mono)"
        >
          Daily
        </text>
        <text
          x={W - PAD.right + 6}
          y={PAD.top - 6}
          textAnchor="start"
          fill="var(--text-muted)"
          fontSize={7}
          fontFamily="var(--font-mono)"
          opacity={0.5}
        >
          Cumul.
        </text>
      </svg>

      {isEmpty && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            pointerEvents: 'none',
          }}
        >
          아직 집계할 데이터가 없습니다.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          padding: '4px 0 0',
          justifyContent: 'center',
        }}
      >
        {allDomList.map((dom) => {
          const cfg = dconfig[dom] ?? { label: dom, color: 'var(--text-muted)' };
          const isHidden = hiddenDomains.has(dom);
          return (
            <div
              key={dom}
              onClick={() => toggleDomain(dom)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.7rem',
                color: isHidden ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: 'pointer',
                opacity: isHidden ? 0.4 : 1,
                transition: 'opacity 0.15s',
                userSelect: 'none',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: isHidden ? 'var(--border-default)' : cfg.color,
                  display: 'inline-block',
                }}
              />
              {cfg.label}
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: `${(Math.min(Math.max(tooltip.x, 90), W - 90) / W) * 100}%`,
            top: 0,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '0.72rem',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
            zIndex: 10,
            minWidth: 140,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
            {tooltip.date}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            Daily ({tooltip.totalDaily})
          </div>
          {tooltip.daily.filter((l) => l.value > 0).map((l) => {
            const cfg = dconfig[l.dom] ?? { label: l.dom, color: 'var(--text-muted)' };
            return (
              <div
                key={l.dom}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: 1, background: cfg.color }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>{cfg.label}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {l.value}
                </span>
              </div>
            );
          })}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              marginTop: 6,
              paddingTop: 6,
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
            }}
          >
            Cumulative: {tooltip.totalCumul.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
