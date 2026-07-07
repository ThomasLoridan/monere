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

// ── Repli : flux RSS Yahoo Finance par valeur ────────────────
// Le plan Finnhub gratuit ne couvre pas les actualités des sociétés non-US
// (403). Le RSS Yahoo est réel, ciblé par symbole et sans clé : chaque item
// garde le lien direct vers l'article et son horodatage.
function rssField(item: string, tag: string): string {
  const m = item.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return (m?.[1] ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function yahooRssNews(symbol: string, days: number): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const cutoff = Date.now() / 1000 - days * 86_400;
  const items: NewsItem[] = [];
  for (const raw of xml.split('<item>').slice(1)) {
    const item = raw.split('</item>')[0] ?? '';
    const headline = rssField(item, 'title');
    const url2 = rssField(item, 'link');
    const publishedAt = Math.floor(new Date(rssField(item, 'pubDate')).getTime() / 1000);
    if (!headline || !url2 || !Number.isFinite(publishedAt) || publishedAt < cutoff) continue;
    const hoursAgo = (Date.now() / 1000 - publishedAt) / 3600;
    items.push({
      id: `rss-${publishedAt}-${items.length}`,
      headline,
      summary: rssField(item, 'description'),
      source: 'Yahoo Finance',
      url: url2,
      imageUrl: null,
      publishedAt,
      hoursAgo: Math.max(0, Math.round(hoursAgo * 10) / 10),
      breaking: hoursAgo < 0.75,
      ticker: symbol,
      category: 'company',
    });
  }
  return items.slice(0, 20);
}

/** Company news over the last `days` days (real articles, real links).
 *  Finnhub (US) → repli RSS Yahoo (EU/UK) → indisponibilité explicite. */
export async function companyNews(symbol: string, days = 7): Promise<NewsResult> {
  return cached(`news:company:v2:${symbol}:${days}`, 60, async () => {
    if (hasKey()) {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - days * 86_400_000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const rows = await fetchJson<FinnhubNews[]>(
          `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${getEnv().FINNHUB_API_KEY}`,
        );
        const items = rows
          .filter((n) => n.headline && n.url)
          .slice(0, 30)
          .map((n) => shape(n, symbol));
        if (items.length > 0) return { available: true, items };
      } catch {
        /* place non couverte par le plan (403 EU/UK) → repli RSS */
      }
    }
    const rss = await yahooRssNews(symbol, days);
    if (rss.length > 0) return { available: true, items: rss };
    return hasKey() ? { available: true, items: [] } : UNAVAILABLE;
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
