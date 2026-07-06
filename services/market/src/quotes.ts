/**
 * Quote orchestrator — Finnhub first (real-time US), Yahoo fallback (keyless).
 * Every quote carries its source link + a `delayed` flag so the UI can be
 * honest about latency (business rule: never present delayed data as live).
 */
import { cached, createLogger } from '@monere/shared';
import { fhQuote, hasFinnhubKey } from './providers/finnhub.js';
import { yahooQuote } from './providers/yahoo.js';
import { isRealtimeSymbol, resolveStock, toFinnhubSymbol, toYahooSymbol } from './universe.js';

const log = createLogger('market-quotes');
const QUOTE_TTL_S = 15; // well under the 30s freshness requirement

export interface Quote {
  ticker: string;
  symbol: string;
  name: string | null;
  currency: string | null;
  price: number;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  marketTime: number | null;
  delayed: boolean;
  provider: string;
  source: { name: string; url: string };
  fetchedAt: number;
}

export async function getQuote(idOrSymbol: string): Promise<Quote> {
  const meta = resolveStock(idOrSymbol);
  const ticker = meta?.ticker ?? idOrSymbol.toUpperCase();
  return cached(`quote:${ticker}`, QUOTE_TTL_S, async () => {
    const realtime = isRealtimeSymbol(idOrSymbol);
    // Finnhub free tier: real-time for US; EU symbols often unsupported → Yahoo
    if (hasFinnhubKey() && realtime) {
      try {
        const q = await fhQuote(toFinnhubSymbol(idOrSymbol));
        return shape(
          ticker,
          meta?.symbol ?? q.symbol,
          q,
          false,
          'finnhub',
          meta?.name ?? null,
          meta?.currency ?? 'USD',
        );
      } catch (err) {
        log.debug({ err, ticker }, 'finnhub quote failed, falling back to yahoo');
      }
    }
    const q = await yahooQuote(toYahooSymbol(idOrSymbol));
    // Yahoo US quotes are near-real-time; EU venues are typically delayed
    const delayed = !realtime;
    return shape(
      ticker,
      meta?.symbol ?? q.symbol,
      q,
      delayed,
      'yahoo',
      meta?.name ?? null,
      q.currency ?? meta?.currency ?? null,
    );
  });
}

function shape(
  ticker: string,
  symbol: string,
  q: {
    price: number;
    change: number | null;
    changePct: number | null;
    previousClose: number | null;
    marketTime: number | null;
    source: { name: string; url: string };
  },
  delayed: boolean,
  provider: string,
  name: string | null,
  currency: string | null,
): Quote {
  return {
    ticker,
    symbol,
    name,
    currency,
    price: q.price,
    change: q.change,
    changePct: q.changePct,
    previousClose: q.previousClose,
    marketTime: q.marketTime,
    delayed,
    provider,
    source: q.source,
    fetchedAt: Date.now(),
  };
}

/** Batch with bounded concurrency (Finnhub free = 60 req/min). */
export async function getQuotes(idsOrSymbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(idsOrSymbols.map((s) => s.toUpperCase()))].slice(0, 40);
  const results: Quote[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = await Promise.allSettled(
      unique.slice(i, i + CONCURRENCY).map((s) => getQuote(s)),
    );
    for (const r of batch) {
      if (r.status === 'fulfilled') results.push(r.value);
      else log.warn({ err: r.reason }, 'quote fetch failed');
    }
  }
  return results;
}
