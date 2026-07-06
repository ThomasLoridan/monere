/** Builds display-ready stock rows from universe metadata + live quotes. */
import React from 'react';
import { useUniverse, useLiveQuotes } from './hooks';
import type { DisplayStock } from '../components/ui';
import type { StockMeta } from '../lib/types';

export function useDisplayStocks(filterIndex?: string): {
  stocks: DisplayStock[];
  metas: StockMeta[];
  loading: boolean;
} {
  const { data: universe, isLoading } = useUniverse();
  const metas = React.useMemo(() => {
    const all = universe?.stocks ?? [];
    return filterIndex ? all.filter((s) => s.indices.includes(filterIndex)) : all;
  }, [universe, filterIndex]);
  const quotes = useLiveQuotes(metas.map((m) => m.ticker));

  const stocks = React.useMemo(
    () =>
      metas.map((m): DisplayStock => {
        const q = quotes.get(m.ticker);
        return {
          ticker: m.ticker,
          name: m.name,
          domain: m.domain,
          exchange: m.exchange,
          sector: m.sector,
          currency: q?.currency ?? m.currency,
          price: q?.price ?? null,
          change: q?.change ?? null,
          changePct: q?.changePct ?? null,
          delayed: q?.delayed ?? !m.realtime,
        };
      }),
    [metas, quotes],
  );

  return { stocks, metas, loading: isLoading };
}

export function useStockMeta(ticker: string | null): StockMeta | null {
  const { data: universe } = useUniverse();
  if (!ticker || !universe) return null;
  const key = ticker.toUpperCase();
  return universe.stocks.find((s) => s.ticker === key || s.symbol === key) ?? null;
}
