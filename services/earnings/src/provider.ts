/**
 * Earnings data — Finnhub (official calendar + historical EPS surprises),
 * price impact computed from REAL daily candles around the report date
 * (via the market service). Beat/miss "confidence" is a transparent statistic
 * derived from the company's own surprise history — never an invented score.
 */
import { cached, fetchJson, getEnv } from '@monere/shared';

const BASE = 'https://finnhub.io/api/v1';

function key(): string | null {
  return getEnv().FINNHUB_API_KEY || null;
}

export interface CalendarEvent {
  id: string;
  ticker: string;
  date: string; // YYYY-MM-DD
  when: 'Before open' | 'After close' | 'TBD';
  quarter: string;
  status: 'upcoming' | 'past';
  consensus: { eps: number | null; revenue: number | null };
  actual: { eps: number | null; revenue: number | null } | null;
  surprise: { eps: string | null; revenue: string | null } | null;
  source: { name: string; url: string };
}

interface FhCalendarRow {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string;
  quarter: number;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number;
}

const SOURCE = (symbol: string) => ({
  name: 'Finnhub — earnings calendar',
  url: `https://finnhub.io/quote/${encodeURIComponent(symbol)}`,
});

function shapeEvent(r: FhCalendarRow): CalendarEvent {
  const today = new Date().toISOString().slice(0, 10);
  const status: CalendarEvent['status'] =
    r.date >= today && r.epsActual == null ? 'upcoming' : 'past';
  const pct = (a: number | null, e: number | null) =>
    a != null && e != null && e !== 0
      ? `${a >= e ? '+' : ''}${(((a - e) / Math.abs(e)) * 100).toFixed(1)}%`
      : null;
  return {
    id: `${r.symbol.toLowerCase()}-${r.year}q${r.quarter}`,
    ticker: r.symbol,
    date: r.date,
    when: r.hour === 'bmo' ? 'Before open' : r.hour === 'amc' ? 'After close' : 'TBD',
    quarter: `Q${r.quarter} ${r.year}`,
    status,
    consensus: {
      eps: r.epsEstimate,
      revenue: r.revenueEstimate == null ? null : r.revenueEstimate / 1e9,
    },
    actual:
      r.epsActual == null
        ? null
        : { eps: r.epsActual, revenue: r.revenueActual == null ? null : r.revenueActual / 1e9 },
    surprise:
      r.epsActual == null
        ? null
        : {
            eps: pct(r.epsActual, r.epsEstimate),
            revenue: pct(r.revenueActual, r.revenueEstimate),
          },
    source: SOURCE(r.symbol),
  };
}

export interface EarningsUnavailable {
  available: false;
  message: string;
}
const UNAVAILABLE: EarningsUnavailable = {
  available: false,
  message:
    'Earnings indisponibles sans clé Finnhub (gratuite) — ajoutez FINNHUB_API_KEY dans .env. Aucune donnée inventée.',
};

/** Official earnings calendar over a window, optionally filtered by symbols. */
export async function calendar(
  fromISO: string,
  toISO: string,
  symbols?: string[],
): Promise<{ available: true; events: CalendarEvent[] } | EarningsUnavailable> {
  const k = key();
  if (!k) return UNAVAILABLE;
  const events = await cached(`earnings:cal:${fromISO}:${toISO}`, 1800, async () => {
    const d = await fetchJson<{ earningsCalendar?: FhCalendarRow[] }>(
      `${BASE}/calendar/earnings?from=${fromISO}&to=${toISO}&token=${k}`,
      { timeoutMs: 15_000 },
    );
    return (d.earningsCalendar ?? []).map(shapeEvent);
  });
  const filtered = symbols?.length
    ? events.filter((e) => symbols.includes(e.ticker.toUpperCase()))
    : events;
  return { available: true, events: filtered.sort((a, b) => a.date.localeCompare(b.date)) };
}

export interface SurpriseRow {
  period: string;
  quarter: string;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
}

/** Historical quarterly EPS vs estimate (real reported figures). */
export async function surpriseHistory(symbol: string): Promise<
  | {
      available: true;
      rows: SurpriseRow[];
      stats: BeatStats;
      source: { name: string; url: string };
    }
  | EarningsUnavailable
> {
  const k = key();
  if (!k) return UNAVAILABLE;
  return cached(`earnings:hist:${symbol}`, 6 * 3600, async () => {
    const rows = await fetchJson<
      Array<{
        actual: number | null;
        estimate: number | null;
        period: string;
        quarter: number;
        year: number;
        surprisePercent: number | null;
      }>
    >(`${BASE}/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${k}`);
    const shaped: SurpriseRow[] = rows.map((r) => ({
      period: r.period,
      quarter: `Q${r.quarter} ${r.year}`,
      epsActual: r.actual,
      epsEstimate: r.estimate,
      surprisePct: r.surprisePercent,
    }));
    return {
      available: true as const,
      rows: shaped,
      stats: beatStats(shaped),
      source: SOURCE(symbol),
    };
  });
}

export interface BeatStats {
  quarters: number;
  beats: number;
  misses: number;
  beatRatePct: number | null;
  avgSurprisePct: number | null;
  /** Derived, transparent expectation: "beat"/"miss" + rate, from history only. */
  tendency: 'beat' | 'miss' | 'inline' | null;
}

export function beatStats(rows: SurpriseRow[]): BeatStats {
  const scored = rows.filter((r) => r.epsActual != null && r.epsEstimate != null);
  if (scored.length === 0)
    return {
      quarters: 0,
      beats: 0,
      misses: 0,
      beatRatePct: null,
      avgSurprisePct: null,
      tendency: null,
    };
  const beats = scored.filter((r) => (r.epsActual as number) > (r.epsEstimate as number)).length;
  const misses = scored.filter((r) => (r.epsActual as number) < (r.epsEstimate as number)).length;
  const surprises = scored.map((r) => r.surprisePct).filter((s): s is number => s != null);
  const avg = surprises.length ? surprises.reduce((a, b) => a + b, 0) / surprises.length : null;
  const beatRate = Math.round((beats / scored.length) * 100);
  return {
    quarters: scored.length,
    beats,
    misses,
    beatRatePct: beatRate,
    avgSurprisePct: avg == null ? null : Math.round(avg * 10) / 10,
    tendency: beatRate >= 60 ? 'beat' : beatRate <= 40 ? 'miss' : 'inline',
  };
}

// ── Price impact ±1 trading day around a report date ────────
interface CandlePoint {
  t: number;
  c: number | null;
}

function marketBase(): string {
  const env = getEnv();
  return env.MONERE_MODE === 'docker'
    ? `http://market:${env.MARKET_PORT}`
    : `http://localhost:${env.MARKET_PORT}`;
}

export interface PriceImpact {
  date: string;
  /** % move close(D-1) → close(D+1) — the 2-day window around the print. */
  d2Pct: number | null;
  /** % move close(D-1) → close(D)  — first session reaction. */
  d1Pct: number | null;
  source: { name: string; url: string } | null;
}

export async function priceImpact(symbol: string, dateISO: string): Promise<PriceImpact> {
  return cached(`earnings:impact:${symbol}:${dateISO}`, 24 * 3600, async () => {
    const env = getEnv();
    try {
      const { points, source } = await fetchJson<{
        points: CandlePoint[];
        source: { name: string; url: string };
      }>(`${marketBase()}/internal/candles/${encodeURIComponent(symbol)}?range=1Y`, {
        headers: { 'x-internal-key': env.INTERNAL_API_KEY },
        timeoutMs: 10_000,
      });
      const target = Math.floor(new Date(`${dateISO}T12:00:00Z`).getTime() / 1000);
      const idx = points.findIndex((p) => p.t >= target - 43_200);
      if (idx < 1 || idx + 1 >= points.length)
        return { date: dateISO, d1Pct: null, d2Pct: null, source };
      const prev = points[idx - 1]?.c;
      const day = points[idx]?.c;
      const next = points[idx + 1]?.c;
      const pct = (a: number | null | undefined, b: number | null | undefined) =>
        a != null && b != null && a !== 0 ? Math.round(((b - a) / a) * 1000) / 10 : null;
      return { date: dateISO, d1Pct: pct(prev, day), d2Pct: pct(prev, next), source };
    } catch {
      return { date: dateISO, d1Pct: null, d2Pct: null, source: null };
    }
  });
}
