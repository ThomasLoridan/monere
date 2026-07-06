/**
 * News provider — Finnhub company-news + general news (free tier).
 * Every item carries the REAL article URL and source name; without a key the
 * API answers with an explicit "unavailable" — headlines are never invented.
 */
import { cached, fetchJson, getEnv } from '@monere/shared';

const BASE = 'https://finnhub.io/api/v1';

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: number; // unix seconds
  hoursAgo: number;
  breaking: boolean;
  ticker?: string;
  category?: string;
}

interface FinnhubNews {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

function hasKey(): boolean {
  return Boolean(getEnv().FINNHUB_API_KEY);
}

function shape(n: FinnhubNews, ticker?: string): NewsItem {
  const hoursAgo = (Date.now() / 1000 - n.datetime) / 3600;
  return {
    id: String(n.id),
    headline: n.headline,
    summary: n.summary,
    source: n.source,
    url: n.url,
    imageUrl: n.image || null,
    publishedAt: n.datetime,
    hoursAgo: Math.max(0, Math.round(hoursAgo * 10) / 10),
    breaking: hoursAgo < 0.75, // <45 min = "dernière minute"
    ...(ticker ? { ticker } : {}),
    category: n.category,
  };
}

export interface NewsResult {
  available: boolean;
  message?: string;
  items: NewsItem[];
}

const UNAVAILABLE: NewsResult = {
  available: false,
  message:
    'Actualités indisponibles sans clé Finnhub (gratuite) — ajoutez FINNHUB_API_KEY dans .env. Aucune actualité inventée.',
  items: [],
};

/** Company news over the last `days` days (real articles, real links). */
export async function companyNews(symbol: string, days = 7): Promise<NewsResult> {
  if (!hasKey()) return UNAVAILABLE;
  return cached(`news:company:${symbol}:${days}`, 60, async () => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const rows = await fetchJson<FinnhubNews[]>(
      `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${getEnv().FINNHUB_API_KEY}`,
    );
    return {
      available: true,
      items: rows
        .filter((n) => n.headline && n.url)
        .slice(0, 30)
        .map((n) => shape(n, symbol)),
    };
  });
}

/** Market-wide headlines (macro, forex, indices). */
export async function marketNews(): Promise<NewsResult> {
  if (!hasKey()) return UNAVAILABLE;
  return cached('news:market', 60, async () => {
    const rows = await fetchJson<FinnhubNews[]>(
      `${BASE}/news?category=general&token=${getEnv().FINNHUB_API_KEY}`,
    );
    return {
      available: true,
      items: rows
        .filter((n) => n.headline && n.url)
        .slice(0, 40)
        .map((n) => shape(n)),
    };
  });
}
