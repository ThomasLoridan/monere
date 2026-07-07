/**
 * Earnings data — sources réelles, en couches :
 *  1. Finnhub par symbole (calendrier officiel + historique des surprises) — US.
 *  2. Yahoo quoteSummary (via l'API interne du service market) — repli EU/UK
 *     que le plan Finnhub gratuit ne couvre pas (403).
 *  3. SEC EDGAR — dates de publication RÉELLES des sociétés US (dépôts 8-K
 *     « Results of Operations », item 2.02) pour calculer l'impact sur le cours.
 * L'impact ±1 jour est mesuré sur les cours de clôture réels (service market).
 * La « tendance battre/manquer » est une statistique transparente dérivée de
 * l'historique publié — jamais un score inventé.
 */
import { cached, createLogger, fetchJson, getEnv } from '@monere/shared';

const BASE = 'https://finnhub.io/api/v1';
const log = createLogger('earnings-provider');

function key(): string | null {
  return getEnv().FINNHUB_API_KEY || null;
}

function marketBase(): string {
  const env = getEnv();
  return env.MONERE_MODE === 'docker'
    ? `http://market:${env.MARKET_PORT}`
    : `http://localhost:${env.MARKET_PORT}`;
}

function internalHeaders(): Record<string, string> {
  return { 'x-internal-key': getEnv().INTERNAL_API_KEY };
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

const FH_SOURCE = (symbol: string) => ({
  name: 'Finnhub — earnings calendar (officiel)',
  url: `https://finnhub.io/quote/${encodeURIComponent(symbol)}`,
});
const YH_SOURCE = (symbol: string) => ({
  name: 'Yahoo Finance — earnings',
  url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis`,
});

const pctStr = (a: number | null, e: number | null) =>
  a != null && e != null && e !== 0
    ? `${a >= e ? '+' : ''}${(((a - e) / Math.abs(e)) * 100).toFixed(1)}%`
    : null;

function shapeFh(r: FhCalendarRow): CalendarEvent {
  const today = new Date().toISOString().slice(0, 10);
  const status: CalendarEvent['status'] =
    r.date >= today && r.epsActual == null ? 'upcoming' : 'past';
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
            eps: pctStr(r.epsActual, r.epsEstimate),
            revenue: pctStr(r.revenueActual, r.revenueEstimate),
          },
    source: FH_SOURCE(r.symbol),
  };
}

export interface EarningsUnavailable {
  available: false;
  message: string;
}
const UNAVAILABLE: EarningsUnavailable = {
  available: false,
  message:
    'Earnings indisponibles auprès de nos sources pour cette valeur — aucune donnée inventée.',
};

// ── Yahoo quoteSummary via l'API interne du service market ──
interface RawVal {
  raw?: number;
  fmt?: string;
}
interface QuoteSummaryResult {
  calendarEvents?: {
    earnings?: { earningsDate?: RawVal[]; earningsAverage?: RawVal; revenueAverage?: RawVal };
  };
  earningsHistory?: {
    history?: Array<{
      epsActual?: RawVal;
      epsEstimate?: RawVal;
      surprisePercent?: RawVal;
      quarter?: RawVal;
    }>;
  };
}

async function yahooSummary(symbol: string, modules: string[]): Promise<QuoteSummaryResult | null> {
  try {
    const res = await fetchJson<{ result: QuoteSummaryResult }>(
      `${marketBase()}/internal/quotesummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}`,
      { headers: internalHeaders(), timeoutMs: 15_000 },
    );
    return res.result;
  } catch (err) {
    log.debug({ err, symbol }, 'yahoo quotesummary indisponible');
    return null;
  }
}

// ── Événements à venir, par symbole ──────────────────────────
export async function upcomingFor(symbol: string): Promise<CalendarEvent[]> {
  return cached(`earnings:up:${symbol}`, 1800, async () => {
    // 1. Finnhub par symbole (couvre les valeurs US du plan gratuit)
    if (key()) {
      try {
        const from = new Date().toISOString().slice(0, 10);
        const to = new Date(Date.now() + 240 * 86_400_000).toISOString().slice(0, 10);
        const d = await fetchJson<{ earningsCalendar?: FhCalendarRow[] }>(
          `${BASE}/calendar/earnings?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key()}`,
          { timeoutMs: 15_000 },
        );
        const rows = (d.earningsCalendar ?? []).map(shapeFh).filter((e) => e.status === 'upcoming');
        if (rows.length > 0) return rows.sort((a, b) => a.date.localeCompare(b.date));
      } catch {
        /* 403 sur les places non couvertes → repli Yahoo */
      }
    }
    // 2. Yahoo calendarEvents (EU/UK — réel)
    const y = await yahooSummary(symbol, ['calendarEvents']);
    const earnings = y?.calendarEvents?.earnings;
    const ts = earnings?.earningsDate?.[0]?.raw;
    if (!ts) return [];
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    if (date < new Date().toISOString().slice(0, 10)) return [];
    const dt = new Date(ts * 1000);
    const q = Math.floor(dt.getUTCMonth() / 3) + 1;
    return [
      {
        id: `${symbol.toLowerCase()}-${dt.getUTCFullYear()}q${q}`,
        ticker: symbol,
        date,
        when: 'TBD',
        quarter: `Q${q} ${dt.getUTCFullYear()}`,
        status: 'upcoming',
        consensus: {
          eps: earnings?.earningsAverage?.raw ?? null,
          revenue: earnings?.revenueAverage?.raw != null ? earnings.revenueAverage.raw / 1e9 : null,
        },
        actual: null,
        surprise: null,
        source: YH_SOURCE(symbol),
      },
    ];
  });
}

/** Calendrier multi-symboles (écran Calendrier) — requêtes par valeur, en parallèle borné. */
export async function calendar(
  fromISO: string,
  toISO: string,
  symbols?: string[],
): Promise<{ available: true; events: CalendarEvent[] } | EarningsUnavailable> {
  if (!symbols?.length) {
    // Sans filtre : calendrier global Finnhub (plafonné par le plan — usage limité)
    if (!key()) return UNAVAILABLE;
    const events = await cached(`earnings:cal:${fromISO}:${toISO}`, 1800, async () => {
      const d = await fetchJson<{ earningsCalendar?: FhCalendarRow[] }>(
        `${BASE}/calendar/earnings?from=${fromISO}&to=${toISO}&token=${key()}`,
        { timeoutMs: 15_000 },
      );
      return (d.earningsCalendar ?? []).map(shapeFh);
    });
    return { available: true, events: events.sort((a, b) => a.date.localeCompare(b.date)) };
  }

  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 30);
  const events: CalendarEvent[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = await Promise.allSettled(
      unique.slice(i, i + CONCURRENCY).map((s) => upcomingFor(s)),
    );
    for (const r of batch) if (r.status === 'fulfilled') events.push(...r.value);
  }
  const filtered = events.filter((e) => e.date >= fromISO && e.date <= toISO);
  return { available: true, events: filtered.sort((a, b) => a.date.localeCompare(b.date)) };
}

// ── Historique des surprises EPS ─────────────────────────────
export interface SurpriseRow {
  period: string;
  quarter: string;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
}

export async function surpriseHistory(symbol: string): Promise<
  | {
      available: true;
      rows: SurpriseRow[];
      stats: BeatStats;
      source: { name: string; url: string };
    }
  | EarningsUnavailable
> {
  return cached(`earnings:hist:v2:${symbol}`, 6 * 3600, async () => {
    // 1. Finnhub (US)
    if (key()) {
      try {
        const rows = await fetchJson<
          Array<{
            actual: number | null;
            estimate: number | null;
            period: string;
            quarter: number;
            year: number;
            surprisePercent: number | null;
          }>
        >(`${BASE}/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${key()}`);
        if (rows.length > 0) {
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
            source: FH_SOURCE(symbol),
          };
        }
      } catch {
        /* 403 EU/UK → repli Yahoo */
      }
    }
    // 2. Yahoo earningsHistory (4 derniers trimestres, réel)
    const y = await yahooSummary(symbol, ['earningsHistory']);
    const hist = y?.earningsHistory?.history ?? [];
    const shaped: SurpriseRow[] = hist
      .filter((h) => h.quarter?.raw)
      .map((h) => {
        const d = new Date((h.quarter!.raw as number) * 1000);
        const q = Math.floor(d.getUTCMonth() / 3) + 1;
        return {
          period: d.toISOString().slice(0, 10),
          quarter: `Q${q} ${d.getUTCFullYear()}`,
          epsActual: h.epsActual?.raw ?? null,
          epsEstimate: h.epsEstimate?.raw ?? null,
          surprisePct: h.surprisePercent?.raw != null ? h.surprisePercent.raw * 100 : null,
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));
    if (shaped.length === 0) return UNAVAILABLE;
    return {
      available: true as const,
      rows: shaped,
      stats: beatStats(shaped),
      source: YH_SOURCE(symbol),
    };
  });
}

export interface BeatStats {
  quarters: number;
  beats: number;
  misses: number;
  beatRatePct: number | null;
  avgSurprisePct: number | null;
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

// ── Dates de publication RÉELLES (US) : 8-K item 2.02 (SEC EDGAR) ──
async function tickerToCik(ticker: string): Promise<number | null> {
  const map = await cached('edgar:tickers', 24 * 3600, async () => {
    const d = await fetchJson<Record<string, { ticker: string; cik_str: number }>>(
      'https://www.sec.gov/files/company_tickers.json',
      { headers: { 'user-agent': getEnv().SEC_EDGAR_USER_AGENT }, timeoutMs: 20_000 },
    );
    const m: Record<string, number> = {};
    for (const v of Object.values(d)) m[v.ticker.toUpperCase()] = v.cik_str;
    return m;
  });
  return map[ticker.toUpperCase()] ?? null;
}

/** Dates des dépôts 8-K « Results of Operations » (publication des résultats). */
export async function usReportDates(ticker: string): Promise<string[]> {
  return cached(`earnings:8k:${ticker}`, 24 * 3600, async () => {
    const cik = await tickerToCik(ticker);
    if (!cik) return [];
    const sub = await fetchJson<{
      filings: { recent: { form: string[]; filingDate: string[]; items?: string[] } };
    }>(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, {
      headers: { 'user-agent': getEnv().SEC_EDGAR_USER_AGENT },
      timeoutMs: 20_000,
    });
    const r = sub.filings.recent;
    const dates: string[] = [];
    for (let i = 0; i < r.form.length; i++) {
      if (r.form[i] === '8-K' && (r.items?.[i] ?? '').includes('2.02')) {
        dates.push(r.filingDate[i]!);
      }
    }
    return dates; // décroissant (ordre EDGAR)
  }).catch(() => []);
}

/** Associe chaque trimestre publié à sa vraie date de publication (8-K le plus
 *  proche après la fin du trimestre, sous 120 jours). */
export function matchReportDates(rows: SurpriseRow[], dates: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const sorted = [...dates].sort();
  for (const row of rows) {
    const after = sorted.find((d) => d >= row.period);
    if (after) {
      const gap = (new Date(after).getTime() - new Date(row.period).getTime()) / 86_400_000;
      if (gap <= 120) out.set(row.period, after);
    }
  }
  return out;
}

// ── Impact ±1 jour de bourse sur cours réels ─────────────────
interface CandlePoint {
  t: number;
  c: number | null;
}

export interface PriceImpact {
  date: string;
  d2Pct: number | null;
  d1Pct: number | null;
  source: { name: string; url: string } | null;
}

export async function priceImpact(symbol: string, dateISO: string): Promise<PriceImpact> {
  return cached(`earnings:impact:${symbol}:${dateISO}`, 24 * 3600, async () => {
    try {
      const { points, source } = await fetchJson<{
        points: CandlePoint[];
        source: { name: string; url: string };
      }>(`${marketBase()}/internal/candles/${encodeURIComponent(symbol)}?range=1Y`, {
        headers: internalHeaders(),
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
