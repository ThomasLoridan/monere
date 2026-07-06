/**
 * Chart components — ported from the design, wired to REAL market data.
 * BigChart consumes timestamped candles; on 1D the x-axis spans the real
 * trading session so the curve is empty pre-open and fills progressively
 * until the close (business requirement).
 */
import React from 'react';
import { fmt } from '../lib/format';
import type { CandlePoint } from '../lib/types';

function buildPath(series: number[], w: number, h: number, pad = 4): { d: string } {
  if (series.length < 2) return { d: '' };
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = innerW / (series.length - 1);
  let d = '';
  series.forEach((v, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((v - min) / range) * innerH;
    d += (i === 0 ? 'M' : ' L') + x.toFixed(2) + ',' + y.toFixed(2);
  });
  return { d };
}

function smoothD(points: Array<[number, number]>): string {
  if (!points.length) return '';
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export function Sparkline({
  series,
  color,
  width = 60,
  height = 26,
}: {
  series: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (series.length < 2) return <svg className="stock-spark" width={width} height={height} />;
  const { d } = buildPath(series, width, height, 2);
  return (
    <svg className="stock-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IndexSpark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return <svg width="100%" height="30" />;
  const { d } = buildPath(series, 130, 30, 2);
  return (
    <svg
      width="100%"
      height="30"
      viewBox="0 0 130 30"
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface OhlcBucket {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number | null;
  tStart: number;
  tEnd: number;
}

function bucketize(points: CandlePoint[], maxCount = 30): OhlcBucket[] {
  const usable = points.filter((p) => p.c != null);
  const count = Math.max(1, Math.min(maxCount, Math.floor(usable.length / 2)));
  const size = Math.ceil(usable.length / count);
  const out: OhlcBucket[] = [];
  for (let i = 0; i < usable.length; i += size) {
    const slice = usable.slice(i, i + size);
    const highs = slice.map((p) => p.h ?? p.c!) as number[];
    const lows = slice.map((p) => p.l ?? p.c!) as number[];
    const vols = slice.map((p) => p.v).filter((v): v is number => v != null);
    out.push({
      open: slice[0]!.o ?? slice[0]!.c!,
      close: slice[slice.length - 1]!.c!,
      high: Math.max(...highs),
      low: Math.min(...lows),
      volume: vols.length ? vols.reduce((a, b) => a + b, 0) : null,
      tStart: slice[0]!.t,
      tEnd: slice[slice.length - 1]!.t,
    });
  }
  return out;
}

function volFmt(v: number | null): string {
  if (v == null) return 'Indisponible';
  if (v >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' Md';
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + ' K';
  return String(Math.round(v));
}

function labelFor(t: number, range: string, timezone: string | null): string {
  const d = new Date(t * 1000);
  const tz = timezone ?? undefined;
  if (range === '1D')
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  if (range === '1W')
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    });
  if (range === '1M' || range === '3M')
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

export interface BigChartProps {
  points: CandlePoint[];
  style?: 'line' | 'area' | 'candle';
  color?: string;
  height?: number;
  animated?: boolean;
  range: string;
  currency?: string;
  interactive?: boolean;
  prevClose?: number | null;
  /** Real session bounds (unix s) — drives the progressive 1D axis. */
  session?: { start: number; end: number } | null;
  timezone?: string | null;
}

export function BigChart({
  points,
  style = 'area',
  color,
  height = 200,
  animated = true,
  range,
  currency = 'USD',
  interactive = true,
  prevClose = null,
  session = null,
  timezone = null,
}: BigChartProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(400);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const measure = () => setWidth(el.offsetWidth || 400);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    setHover(null);
  }, [range, style, points.length]);

  const isIntraday = range === '1D';
  // Intraday: keep only today's session — before the open the chart is empty
  // and the curve fills progressively as real prints arrive (business rule).
  const usable = React.useMemo(() => {
    const withClose = points.filter((p) => p.c != null);
    if (isIntraday && session) {
      return withClose.filter((p) => p.t >= session.start - 60 && p.t <= session.end + 60);
    }
    return withClose;
  }, [points, isIntraday, session]);
  const pad = 6;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  if (usable.length < 2) {
    return (
      <div
        ref={wrapRef}
        style={{
          width: '100%',
          height: height + 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--ink-3)',
          }}
        >
          {isIntraday ? 'Marché pas encore ouvert' : 'Données indisponibles'}
        </div>
        {isIntraday && session && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            La courbe se remplira au fil de la séance ({labelFor(session.start, '1D', timezone)} →{' '}
            {labelFor(session.end, '1D', timezone)})
          </div>
        )}
      </div>
    );
  }

  // x position: intraday → real time fraction of the session; else uniform
  const t0 = isIntraday && session ? session.start : usable[0]!.t;
  const t1 = isIntraday && session ? session.end : usable[usable.length - 1]!.t;
  const tSpan = Math.max(1, t1 - t0);
  const xOfT = (t: number) => pad + Math.max(0, Math.min(1, (t - t0) / tSpan)) * innerW;
  const xOfI = (i: number) => pad + (i / (usable.length - 1)) * innerW;
  const xOf = (p: CandlePoint, i: number) => (isIntraday && session ? xOfT(p.t) : xOfI(i));

  const closes = usable.map((p) => p.c!) as number[];
  const domainVals = isIntraday && prevClose != null ? closes.concat([prevClose]) : closes;
  const dmin = Math.min(...domainVals);
  const dmax = Math.max(...domainVals);
  const drange = dmax - dmin || 1;
  const yOf = (v: number) => pad + innerH - ((v - dmin) / drange) * innerH;

  const pts: Array<[number, number]> = usable.map((p, i) => [xOf(p, i), yOf(p.c!)]);
  const d = smoothD(pts);
  const lastX = pts[pts.length - 1]![0];
  const lastY = pts[pts.length - 1]![1];
  const isUp = closes[closes.length - 1]! >= closes[0]!;
  const c = color || (isUp ? 'var(--pos)' : 'var(--neg)');
  const gradId = 'grad-' + c.replace(/[^a-z0-9]/gi, '');

  const buckets = style === 'candle' ? bucketize(usable) : null;

  // hover geometry
  let hx: number | null = null;
  let hy: number | null = null;
  let hval: number | null = null;
  let hlabel: string | null = null;
  let hohlc: OhlcBucket | null = null;
  const isIndex = (currency || '').trim() === 'pts';
  if (hover != null) {
    if (style === 'candle' && buckets) {
      const ci = Math.min(hover, buckets.length - 1);
      const b = buckets[ci]!;
      hval = b.close;
      const span = isIntraday && session ? xOfT(usable[usable.length - 1]!.t) - pad : innerW;
      hx = pad + (ci + 0.5) * (span / buckets.length);
      hy = yOf(b.close);
      hlabel = labelFor(b.tEnd, range, timezone);
      hohlc = b;
    } else {
      const i = Math.min(hover, usable.length - 1);
      const p = usable[i]!;
      hx = pts[i]![0];
      hy = pts[i]![1];
      hval = p.c;
      hlabel = labelFor(p.t, range, timezone);
      hohlc = {
        open: p.o ?? p.c!,
        close: p.c!,
        high: p.h ?? p.c!,
        low: p.l ?? p.c!,
        volume: isIndex ? null : p.v,
        tStart: p.t,
        tEnd: p.t,
      };
    }
  }
  const panelSide: 'left' | 'right' = hx != null && hx > width * 0.55 ? 'left' : 'right';

  const idxFromClientX = (clientX: number): number => {
    if (!wrapRef.current) return 0;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    if (style === 'candle' && buckets) {
      const span = isIntraday && session ? xOfT(usable[usable.length - 1]!.t) - pad : innerW;
      return Math.max(
        0,
        Math.min(buckets.length - 1, Math.floor((x - pad) / (span / buckets.length))),
      );
    }
    // nearest point by x
    let best = 0;
    let bestDist = Infinity;
    pts.forEach(([px], i) => {
      const dist = Math.abs(px - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  };

  const levels = [0.25, 0.5, 0.75];
  // Real axis labels: 5 evenly spaced timestamps across the domain
  const axisLabels = Array.from({ length: 5 }, (_, i) =>
    labelFor(t0 + (tSpan * i) / 4, range, timezone),
  );
  const cur = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', position: 'relative', touchAction: 'pan-y' }}
      onMouseMove={interactive ? (e) => setHover(idxFromClientX(e.clientX)) : undefined}
      onMouseLeave={interactive ? () => setHover(null) : undefined}
      onTouchStart={
        interactive ? (e) => setHover(idxFromClientX(e.touches[0]!.clientX)) : undefined
      }
      onTouchMove={interactive ? (e) => setHover(idxFromClientX(e.touches[0]!.clientX)) : undefined}
      onTouchEnd={interactive ? () => setHover(null) : undefined}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={style === 'area' ? 0.28 : 0} />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </linearGradient>
        </defs>

        {levels.map((l, i) => (
          <line
            key={i}
            x1={pad}
            x2={width - pad}
            y1={pad + innerH * l}
            y2={pad + innerH * l}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        ))}

        {style === 'candle' && buckets && (
          <Candles
            buckets={buckets}
            yOf={yOf}
            xStart={pad}
            xSpan={isIntraday && session ? xOfT(usable[usable.length - 1]!.t) - pad : innerW}
          />
        )}

        {style === 'area' && (
          <path
            d={`${d} L${lastX},${height - pad} L${pts[0]![0]},${height - pad} Z`}
            fill={`url(#${gradId})`}
            className={animated ? 'fade-in' : ''}
          />
        )}

        {style !== 'candle' && (
          <path
            d={d}
            fill="none"
            stroke={c}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={animated ? 'fade-in' : ''}
          />
        )}

        {isIntraday && prevClose != null && (
          <line
            x1={pad}
            x2={width - pad}
            y1={yOf(prevClose)}
            y2={yOf(prevClose)}
            stroke="var(--ink-3)"
            strokeWidth="1"
            strokeDasharray="1 4"
            opacity="0.7"
          />
        )}

        {style !== 'candle' && hover == null && (
          <>
            <circle cx={lastX} cy={lastY} r="8" fill={c} opacity="0.18" />
            <circle cx={lastX} cy={lastY} r="3.5" fill={c} />
          </>
        )}

        {hover != null && hx != null && hy != null && (
          <g>
            <line
              x1={hx}
              x2={hx}
              y1={pad}
              y2={height - pad}
              stroke="var(--ink-3)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
            <line
              x1={pad}
              x2={width - pad}
              y1={hy}
              y2={hy}
              stroke="var(--ink-3)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.45"
            />
            <circle cx={hx} cy={hy} r="9" fill={c} opacity="0.16" />
            <circle cx={hx} cy={hy} r="4" fill={c} stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {hover != null && hy != null && (
        <div className="hover-price num" style={{ top: Math.max(8, Math.min(height - 14, hy)) }}>
          {fmt(hval, { decimals: 2 })}
          <span className="cur">{cur}</span>
        </div>
      )}

      {hover != null && hx != null && (
        <div className="hover-date num" style={{ left: Math.max(34, Math.min(width - 34, hx)) }}>
          {hlabel}
        </div>
      )}

      {hover != null && hohlc && (
        <div className="ohlc-panel" style={{ [panelSide]: 8 } as React.CSSProperties}>
          <div className="ohlc-row">
            <span className="k">Ouv.</span>
            <span className="v num">
              {fmt(hohlc.open, { decimals: 2 })}
              {cur}
            </span>
          </div>
          <div className="ohlc-row">
            <span className="k">Haut</span>
            <span className="v num" style={{ color: 'var(--pos)' }}>
              {fmt(hohlc.high, { decimals: 2 })}
              {cur}
            </span>
          </div>
          <div className="ohlc-row">
            <span className="k">Bas</span>
            <span className="v num" style={{ color: 'var(--neg)' }}>
              {fmt(hohlc.low, { decimals: 2 })}
              {cur}
            </span>
          </div>
          <div className="ohlc-row">
            <span className="k">Clôt.</span>
            <span className="v num" style={{ fontWeight: 600 }}>
              {fmt(hohlc.close, { decimals: 2 })}
              {cur}
            </span>
          </div>
          <div className="ohlc-row vol">
            <span className="k">Vol.</span>
            <span className="v num">{volFmt(hohlc.volume)}</span>
          </div>
        </div>
      )}

      {isIntraday && prevClose != null && (
        <div
          className="prevclose-label num"
          style={{ top: Math.max(2, Math.min(height - 24, yOf(prevClose) + 3)) }}
        >
          <span className="lbl">Clôture veille</span>
          <span className="val">
            {fmt(prevClose, { decimals: 2 })}
            {cur}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 14px 0',
          fontSize: 10,
          color: 'var(--ink-3)',
          opacity: hover != null ? 0 : 1,
          transition: 'opacity 140ms ease',
        }}
      >
        {axisLabels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Candles({
  buckets,
  yOf,
  xStart,
  xSpan,
}: {
  buckets: OhlcBucket[];
  yOf: (v: number) => number;
  xStart: number;
  xSpan: number;
}) {
  const cw = xSpan / buckets.length;
  const bodyW = Math.max(3, cw * 0.55);
  return (
    <g>
      {buckets.map((b, i) => {
        const x = xStart + (i + 0.5) * cw;
        const up = b.close >= b.open;
        const col = up ? 'var(--pos)' : 'var(--neg)';
        const top = Math.min(yOf(b.open), yOf(b.close));
        const bot = Math.max(yOf(b.open), yOf(b.close));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yOf(b.high)} y2={yOf(b.low)} stroke={col} strokeWidth="1" />
            <rect
              x={x - bodyW / 2}
              y={top}
              width={bodyW}
              height={Math.max(1, bot - top)}
              fill={col}
              rx="1"
            />
          </g>
        );
      })}
    </g>
  );
}

export function EpsSpreadBar({
  low,
  high,
  consensus,
  actual,
}: {
  low: number;
  high: number;
  consensus: number;
  actual: number | null;
}) {
  const range = high - low || 1;
  const consPct = ((consensus - low) / range) * 100;
  const actPct = actual != null ? ((actual - low) / range) * 100 : null;
  return (
    <div style={{ position: 'relative', height: 56, padding: '6px 8px 12px' }}>
      <div
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: 0,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--ink-3)',
        }}
      >
        <span>${low.toFixed(2)}</span>
        <span>${high.toFixed(2)}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: 24,
          height: 6,
          background: 'var(--surface-3)',
          borderRadius: 100,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: 24,
          height: 6,
          borderRadius: 100,
          background: 'linear-gradient(90deg, var(--accent-soft), var(--accent))',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: `calc(8px + ${consPct}% * (100% - 16px) / 100)`,
          width: 2,
          height: 18,
          background: 'var(--ink-2)',
          borderRadius: 1,
          transform: 'translateX(-1px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: `calc(8px + ${consPct}% * (100% - 16px) / 100)`,
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'var(--ink-2)',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        Consensus
      </div>
      {actPct != null && actual != null && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: `calc(8px + ${actPct}% * (100% - 16px) / 100)`,
            width: 12,
            height: 12,
            background: actual >= consensus ? 'var(--pos)' : 'var(--neg)',
            borderRadius: 100,
            border: '2px solid var(--surface)',
            transform: 'translateX(-50%)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}
        />
      )}
    </div>
  );
}
