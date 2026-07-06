/* WATCHLIST — server-persisted favourites with live quotes */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, StockRow, StockLogo, LoadingRows } from '../components/ui';
import { useWatchlist, useLiveQuotes, useUniverse, useEarningsCalendar } from '../data/hooks';
import { frDate, cleanTicker } from '../lib/format';
import type { ScreenProps } from '../state/nav';
import type { DisplayStock } from '../components/ui';

export function WatchScreen({ nav }: ScreenProps) {
  const { data: watchData, isLoading } = useWatchlist();
  const { data: universe } = useUniverse();
  const [sortMode, setSortMode] = React.useState<'default' | 'perf'>('default');

  const watch = watchData?.tickers ?? [];
  const quotes = useLiveQuotes(watch);

  const items: DisplayStock[] = watch.map((t) => {
    const meta = (universe?.stocks ?? []).find((s) => s.ticker === t);
    const q = quotes.get(t);
    return {
      ticker: t,
      name: meta?.name ?? q?.name ?? t,
      domain: meta?.domain,
      currency: q?.currency ?? meta?.currency,
      price: q?.price ?? null,
      change: q?.change ?? null,
      changePct: q?.changePct ?? null,
      delayed: q?.delayed,
    };
  });
  const sortedItems =
    sortMode === 'perf'
      ? [...items].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))
      : items;

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={() => nav('home')}>
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={() => nav('search')}>
            <Icon name="plus" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">
          Favoris · {items.length} valeur{items.length > 1 ? 's' : ''}
        </div>
        <h1>
          Ma <em>watchlist</em>.
        </h1>
        <p className="sub">
          Les valeurs que tu suis de près, avec leurs earnings à venir mis en avant.
        </p>
      </div>

      {isLoading ? (
        <LoadingRows count={4} />
      ) : items.length === 0 ? (
        <div className="watchlist-empty">
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 28,
              color: 'var(--ink-2)',
              marginBottom: 8,
            }}
          >
            Vide pour l'instant
          </div>
          <div style={{ fontSize: 13 }}>Touche l'étoile sur une valeur pour l'ajouter ici.</div>
        </div>
      ) : (
        <>
          <div className="section-head" style={{ paddingTop: 6 }}>
            <div className="title">Tous tes favoris</div>
            <button
              className="action"
              onClick={() => setSortMode((m) => (m === 'default' ? 'perf' : 'default'))}
            >
              Trier · {sortMode === 'default' ? 'Ordre ajouté' : 'Performance'}
            </button>
          </div>
          <div className="stock-section">
            {sortedItems.map((s) => (
              <StockRow
                key={s.ticker}
                stock={s}
                showSpark={false}
                onClick={(st) => nav('stock', { ticker: st.ticker })}
              />
            ))}
          </div>

          <WatchUpcoming watch={watch} nav={nav} />
        </>
      )}
    </div>
  );
}

function WatchUpcoming({ watch, nav }: { watch: string[]; nav: ScreenProps['nav'] }) {
  const { data: universe } = useUniverse();
  const metaByTicker = new Map((universe?.stocks ?? []).map((s) => [s.ticker, s]));
  const symbols = watch.map((t) => metaByTicker.get(t)?.finnhub ?? t);
  const { data } = useEarningsCalendar(symbols.length ? symbols : undefined);
  const upcoming = (data?.available ? data.events : [])
    .filter((e) => e.status === 'upcoming')
    .slice(0, 5);
  if (upcoming.length === 0) return null;

  return (
    <>
      <div className="section-head">
        <div className="title">Prochains earnings · favoris</div>
      </div>
      <div style={{ margin: '0 20px' }}>
        {upcoming.map((e) => {
          const meta = (universe?.stocks ?? []).find((s) => s.finnhub === e.ticker);
          return (
            <button
              key={e.id}
              className="earning-row"
              onClick={() => nav('earnings', { id: e.id, ticker: e.ticker })}
            >
              <StockLogo stock={{ ticker: e.ticker, domain: meta?.domain }} />
              <div className="info">
                <div className="tk">{cleanTicker(e.ticker)}</div>
                <div className="nm">
                  {frDate(e.date)} · {e.quarter}
                </div>
              </div>
              <div className="pred">
                <div>Consensus EPS</div>
                <div className="conf beat">
                  {e.consensus.eps != null ? e.consensus.eps.toFixed(2) : '—'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
