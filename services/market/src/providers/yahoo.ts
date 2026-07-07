/**
 * Yahoo Finance chart API client (query1.finance.yahoo.com/v8/finance/chart).
 * Keyless, real market data (US + EU venues). Used as the free fallback for
 * candles/history and for EU quotes; EU data may be ~15 min delayed and is
 * flagged as such in every response.
 */
import { fetchJson, upstreamUnavailable } from '@monere/shared';

const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };

export type ChartRange = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';

const RANGE_MAP: Record<ChartRange, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '2m' },
  '1W': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '60m' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        currency: string;
        symbol: string;
        exchangeName: string;
        regularMarketPrice: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
        exchangeTimezoneName?: string;
        currentTradingPeriod?: {
          regular?: { start: number; end: number };
        };
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          close?: (number | null)[];
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

export interface CandlePoint {
  t: number; // unix seconds
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

export interface ChartResult {
  symbol: string;
  currency: string;
  exchange: string;
  price: number;
  previousClose: number | null;
  marketTime: number | null;
  timezone: string | null;
  session: { start: number; end: number } | null;
  points: CandlePoint[];
  source: { name: string; url: string };
}

export async function yahooChart(symbol: string, range: ChartRange): Promise<ChartResult> {
  const { range: r, interval } = RANGE_MAP[range];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${interval}&includePrePost=false&events=div%2Csplit`;
  const data = await fetchJson<YahooChartResponse>(url, { headers: UA });
  const result = data.chart.result?.[0];
  if (!result) {
    throw upstreamUnavailable(
      `Yahoo Finance: aucune donnée pour ${symbol}${data.chart.error ? ` (${data.chart.error.description})` : ''}`,
    );
  }
  const q = result.indicators.quote[0] ?? {};
  const ts = result.timestamp ?? [];
  const points: CandlePoint[] = ts.map((t, i) => ({
    t,
    o: q.open?.[i] ?? null,
    h: q.high?.[i] ?? null,
    l: q.low?.[i] ?? null,
    c: q.close?.[i] ?? null,
    v: q.volume?.[i] ?? null,
  }));
  return {
    symbol: result.meta.symbol,
    currency: result.meta.currency,
    exchange: result.meta.exchangeName,
    price: result.meta.regularMarketPrice,
    previousClose: result.meta.chartPreviousClose ?? result.meta.previousClose ?? null,
    marketTime: result.meta.regularMarketTime ?? null,
    timezone: result.meta.exchangeTimezoneName ?? null,
    session: result.meta.currentTradingPeriod?.regular
      ? {
          start: result.meta.currentTradingPeriod.regular.start,
          end: result.meta.currentTradingPeriod.regular.end,
        }
      : null,
    points,
    source: {
      name: 'Yahoo Finance',
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    },
  };
}

/** Lightweight quote derived from the 1D chart metadata (keyless). */
export async function yahooQuote(symbol: string) {
  const chart = await yahooChart(symbol, '1D');
  const prev = chart.previousClose;
  const change = prev != null ? chart.price - prev : null;
  return {
    symbol,
    price: chart.price,
    previousClose: prev,
    change,
    changePct: prev ? ((chart.price - prev) / prev) * 100 : null,
    currency: chart.currency,
    marketTime: chart.marketTime,
    source: chart.source,
  };
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol: string;
    shortname?: string;
    longname?: string;
    exchDisp?: string;
    typeDisp?: string;
    quoteType?: string;
  }>;
}

export async function yahooSearch(query: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
  const data = await fetchJson<YahooSearchResponse>(url, { headers: UA });
  return (data.quotes ?? [])
    .filter((q) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX')
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp ?? '',
      type: q.typeDisp ?? q.quoteType ?? '',
    }));
}

// ── quoteSummary (crumb + cookie) — fondamentaux réels US + EU ──
// Yahoo exige depuis 2023 un cookie de session et un "crumb" anti-CSRF.
// On les obtient une fois et on les met en cache mémoire (re-tentative sur 401/403).
let crumbState: { cookie: string; crumb: string } | null = null;

async function getCrumb(): Promise<{ cookie: string; crumb: string }> {
  if (crumbState) return crumbState;
  const res = await fetch('https://fc.yahoo.com', {
    headers: UA,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  if (!cookie) throw upstreamUnavailable('Yahoo: cookie de session indisponible');
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...UA, cookie },
    signal: AbortSignal.timeout(10_000),
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes('<')) {
    throw upstreamUnavailable('Yahoo: crumb indisponible');
  }
  crumbState = { cookie, crumb };
  return crumbState;
}

interface RawVal {
  raw?: number;
}
type Mod = Record<string, RawVal | number | string | undefined | null | unknown>;

export interface QuoteSummaryResult {
  summaryDetail?: Mod;
  defaultKeyStatistics?: Mod;
  calendarEvents?: { earnings?: { earningsDate?: RawVal[]; earningsAverage?: RawVal } };
  earningsHistory?: {
    history?: Array<{
      epsActual?: RawVal;
      epsEstimate?: RawVal;
      surprisePercent?: RawVal;
      quarter?: { raw?: number; fmt?: string };
    }>;
  };
}

export async function yahooQuoteSummary(
  symbol: string,
  modules: string[],
): Promise<QuoteSummaryResult> {
  const attempt = async () => {
    const { cookie, crumb } = await getCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, {
      headers: { ...UA, cookie },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 401 || res.status === 403) {
      crumbState = null; // crumb périmé — on le régénèrera
      throw upstreamUnavailable(`Yahoo quoteSummary ${res.status} pour ${symbol}`);
    }
    if (!res.ok) throw upstreamUnavailable(`Yahoo quoteSummary ${res.status} pour ${symbol}`);
    const data = (await res.json()) as { quoteSummary?: { result?: QuoteSummaryResult[] } };
    const result = data.quoteSummary?.result?.[0];
    if (!result) throw upstreamUnavailable(`Yahoo: aucun fondamental pour ${symbol}`);
    return result;
  };
  try {
    return await attempt();
  } catch {
    return attempt(); // seconde chance avec crumb régénéré
  }
}

const raw = (m: Mod | undefined, key: string): number | null => {
  const v = m?.[key] as RawVal | undefined;
  return typeof v?.raw === 'number' ? v.raw : null;
};

/** Ratios réels via Yahoo — utilisé quand Finnhub ne couvre pas la place (EU/UK). */
export async function yahooRatios(symbol: string) {
  const r = await yahooQuoteSummary(symbol, ['summaryDetail', 'defaultKeyStatistics']);
  const sd = r.summaryDetail;
  const ks = r.defaultKeyStatistics;
  const divYield = raw(sd, 'dividendYield');
  const mcap = raw(sd, 'marketCap');
  return {
    pe: raw(sd, 'trailingPE'),
    eps: raw(ks, 'trailingEps'),
    beta: raw(sd, 'beta') ?? raw(ks, 'beta'),
    divYield: divYield != null ? divYield * 100 : null,
    high52: raw(sd, 'fiftyTwoWeekHigh'),
    low52: raw(sd, 'fiftyTwoWeekLow'),
    peg: raw(ks, 'pegRatio'),
    avgVolume10d: raw(sd, 'averageVolume10days'),
    marketCap: mcap != null ? mcap / 1e6 : null, // même unité que Finnhub (millions)
    source: {
      name: 'Yahoo Finance',
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/key-statistics`,
    },
  };
}
