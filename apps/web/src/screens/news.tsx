/* NEWS FEED — real aggregated feed (market + followed companies), 30s refresh */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, LoadingRows, DataUnavailable } from '../components/ui';
import { useNewsFeed, useWatchlist, useUniverse } from '../data/hooks';
import { NewsFeedRow } from './home';
import type { ScreenProps } from '../state/nav';

export function NewsScreen({ nav, back }: ScreenProps) {
  const { data: watchData } = useWatchlist();
  const { data: universe } = useUniverse();
  const metaByTicker = new Map((universe?.stocks ?? []).map((s) => [s.ticker, s]));
  const watchSymbols = (watchData?.tickers ?? []).map((t) => metaByTicker.get(t)?.finnhub ?? t);
  const symbols = watchSymbols.length
    ? watchSymbols
    : (universe?.stocks ?? []).slice(0, 8).map((s) => s.finnhub);
  const { data, isLoading } = useNewsFeed(symbols);

  const [filter, setFilter] = React.useState<'all' | 'company' | 'market'>('all');
  const [query, setQuery] = React.useState('');

  const feed = data?.available ? data.items : [];
  const filters = [
    { id: 'all', label: 'Tout' },
    { id: 'company', label: 'Entreprises' },
    { id: 'market', label: 'Marchés' },
  ] as const;

  const filtered = feed.filter((n) => {
    if (filter !== 'all' && n.kind !== filter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      n.headline.toLowerCase().includes(q) ||
      n.source.toLowerCase().includes(q) ||
      (n.ticker ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={back}>
            <Icon name="back" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">Actualités · {feed.length} articles · maj 30s</div>
        <h1>
          Le <em>fil</em>
          <br />
          des marchés.
        </h1>
        <p className="sub">
          Entreprises que tu suis, indices et macro — sources officielles, liens directs.
        </p>
      </div>

      <div className="search-bar-wrap">
        <div className="search-bar">
          <Icon name="search" size={16} color="var(--ink-3)" />
          <input
            type="text"
            placeholder="Rechercher une actu, une source, un ticker…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')}>
              <Icon name="plus" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="filter-pills" style={{ paddingTop: 14 }}>
        {filters.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? 'active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows count={6} />
      ) : data && !data.available ? (
        <DataUnavailable message={data.message} />
      ) : filtered.length === 0 ? (
        <div className="watchlist-empty">Aucune actualité ne correspond.</div>
      ) : (
        <div style={{ margin: '4px 0 12px' }}>
          {filtered.map((n) => (
            <NewsFeedRow key={n.id + n.url} n={n} nav={nav} />
          ))}
        </div>
      )}
    </div>
  );
}
