/**
 * Finnhub client (https://finnhub.io) — primary market-data provider.
 * Free tier: real-time US quotes (REST + websocket), symbol directories,
 * company profiles & fundamental metrics. EU quotes are delayed on free.
 */
import { fetchJson, getEnv, upstreamUnavailable } from '@monere/shared';

const BASE = 'https://finnhub.io/api/v1';

function key(): string {
  const k = getEnv().FINNHUB_API_KEY;
  if (!k)
    throw upstreamUnavailable(
      'FINNHUB_API_KEY manquant — ajoutez votre clé gratuite (finnhub.io) dans .env',
      'NO_API_KEY',
    );
  return k;
}

export function hasFinnhubKey(): boolean {
  return Boolean(getEnv().FINNHUB_API_KEY);
}

export async function fhQuote(symbol: string) {
  const d = await fetchJson<{
    c: number;
    d: number;
    dp: number;
    h: number;
    l: number;
    o: number;
    pc: number;
    t: number;
  }>(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key()}`);
  if (!d.c && !d.pc) throw upstreamUnavailable(`Finnhub: aucune cotation pour ${symbol}`);
  return {
    symbol,
    price: d.c,
    previousClose: d.pc,
    change: d.d,
    changePct: d.dp,
    high: d.h,
    low: d.l,
    open: d.o,
    marketTime: d.t,
    source: { name: 'Finnhub', url: `https://finnhub.io/quote/${encodeURIComponent(symbol)}` },
  };
}

/** Full symbol directory for an exchange — the real, complete market listing.
 *  Exchange codes: US, PA (Euronext Paris), DE (XETRA), AS (Amsterdam), L (LSE)… */
export async function fhSymbols(exchange: string) {
  const rows = await fetchJson<
    Array<{
      symbol: string;
      description: string;
      type: string;
      currency?: string;
      mic?: string;
      displaySymbol: string;
    }>
  >(`${BASE}/stock/symbol?exchange=${encodeURIComponent(exchange)}&token=${key()}`, {
    timeoutMs: 20_000,
  });
  return rows
    .filter((r) => r.type === 'Common Stock' || r.type === 'ADR' || r.type === '')
    .map((r) => ({
      symbol: r.displaySymbol || r.symbol,
      name: r.description,
      currency: r.currency ?? null,
      mic: r.mic ?? null,
    }));
}

export async function fhProfile(symbol: string) {
  const p = await fetchJson<{
    name?: string;
    exchange?: string;
    currency?: string;
    marketCapitalization?: number;
    finnhubIndustry?: string;
    weburl?: string;
    logo?: string;
    ipo?: string;
    country?: string;
    shareOutstanding?: number;
  }>(`${BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key()}`);
  return Object.keys(p).length ? p : null;
}

export async function fhMetrics(symbol: string) {
  const d = await fetchJson<{ metric?: Record<string, number | null> }>(
    `${BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key()}`,
  );
  const m = d.metric ?? {};
  return {
    pe: m['peTTM'] ?? m['peBasicExclExtraTTM'] ?? null,
    eps: m['epsTTM'] ?? null,
    beta: m['beta'] ?? null,
    divYield: m['currentDividendYieldTTM'] ?? m['dividendYieldIndicatedAnnual'] ?? null,
    high52: m['52WeekHigh'] ?? null,
    low52: m['52WeekLow'] ?? null,
    peg: m['pegTTM'] ?? null,
    avgVolume10d: m['10DayAverageTradingVolume'] ?? null,
    marketCap: m['marketCapitalization'] ?? null,
    source: { name: 'Finnhub', url: `https://finnhub.io/quote/${encodeURIComponent(symbol)}` },
  };
}

export async function fhSearch(query: string) {
  const d = await fetchJson<{
    result?: Array<{ symbol: string; description: string; type: string; displaySymbol: string }>;
  }>(`${BASE}/search?q=${encodeURIComponent(query)}&token=${key()}`);
  return (d.result ?? []).slice(0, 12).map((r) => ({
    symbol: r.displaySymbol || r.symbol,
    name: r.description,
    exchange: '',
    type: r.type,
  }));
}

/** Index constituents — requires a paid Finnhub plan; caller falls back to
 *  the Wikipedia-sourced list when this throws. */
export async function fhConstituents(indexSymbol: string) {
  const d = await fetchJson<{ constituents?: string[] }>(
    `${BASE}/index/constituents?symbol=${encodeURIComponent(indexSymbol)}&token=${key()}`,
  );
  if (!d.constituents?.length)
    throw upstreamUnavailable('Constituents non disponibles sur ce plan Finnhub');
  return d.constituents;
}
