/**
 * Gathers REAL data (quotes, news, earnings) from the other services so the
 * LLM only ever reasons over sourced facts — never its training memory.
 * Calls are made with the internal service key.
 */
import { fetchJson, getEnv, createLogger } from '@monere/shared';

const log = createLogger('ai-context');

function base(service: 'market' | 'news' | 'earnings', port: number): string {
  const env = getEnv();
  return env.MONERE_MODE === 'docker' ? `http://${service}:${port}` : `http://localhost:${port}`;
}

/** Forward the end-user's JWT — the data services enforce auth themselves. */
function authHeaders(userBearer: string): Record<string, string> {
  return { authorization: userBearer };
}

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number;
  hoursAgo: number;
}

export async function getCompanyNews(symbol: string, userBearer: string): Promise<NewsItem[]> {
  const env = getEnv();
  try {
    const res = await fetchJson<{ available: boolean; items: NewsItem[] }>(
      `${base('news', env.NEWS_PORT)}/news/company/${encodeURIComponent(symbol)}?days=7`,
      { headers: authHeaders(userBearer), timeoutMs: 12_000 },
    );
    return res.available ? res.items.slice(0, 15) : [];
  } catch (err) {
    log.warn({ err, symbol }, 'news fetch failed');
    return [];
  }
}

export interface QuoteContext {
  price: number;
  changePct: number | null;
  currency: string | null;
  delayed: boolean;
  source: { name: string; url: string };
}

export async function getQuote(symbol: string, userBearer: string): Promise<QuoteContext | null> {
  const env = getEnv();
  try {
    const res = await fetchJson<{ quote: QuoteContext }>(
      `${base('market', env.MARKET_PORT)}/market/quote/${encodeURIComponent(symbol)}`,
      { headers: authHeaders(userBearer), timeoutMs: 12_000 },
    );
    return res.quote;
  } catch (err) {
    log.warn({ err, symbol }, 'quote fetch failed');
    return null;
  }
}

export interface EarningsContext {
  upcoming: Array<{
    date: string;
    quarter: string;
    consensus: { eps: number | null; revenue: number | null };
  }>;
  history: {
    stats: { beatRatePct: number | null; avgSurprisePct: number | null; quarters: number };
  } | null;
  past: Array<{
    date: string;
    quarter: string;
    surprise: unknown;
    priceImpact: { d1Pct: number | null; d2Pct: number | null };
  }>;
}

export async function getEarnings(
  symbol: string,
  userBearer: string,
): Promise<EarningsContext | null> {
  const env = getEnv();
  try {
    const res = await fetchJson<{ available: boolean } & EarningsContext>(
      `${base('earnings', env.EARNINGS_PORT)}/earnings/company/${encodeURIComponent(symbol)}`,
      { headers: authHeaders(userBearer), timeoutMs: 15_000 },
    );
    return res.available ? res : null;
  } catch (err) {
    log.warn({ err, symbol }, 'earnings fetch failed');
    return null;
  }
}
