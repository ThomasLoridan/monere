/* SEARCH — core universe + full market search (Finnhub/Yahoo, real listings) */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, StockLogo, LoadingRows } from '../components/ui';
import { useSearch, useWatchlist, useToggleWatch } from '../data/hooks';
import { useDisplayStocks } from '../data/display';
import { fmt, pct, cleanTicker } from '../lib/format';
import type { ScreenProps } from '../state/nav';
import type { DisplayStock } from '../components/ui';

export function SearchScreen({ nav, back }: ScreenProps) {
  const [q, setQ] = React.useState('');
  const query = q.trim();
  const { stocks } = useDisplayStocks();
  const remote = useSearch(query.length >= 2 ? query : '');
  const { data: watchData } = useWatchlist();
  const toggleWatch = useToggleWatch();
  const watch = watchData?.tickers ?? [];

  const local = query
    ? stocks.filter(
        (s) =>
          s.ticker.toLowerCase().includes(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase()),
      )
    : stocks;
  const localTickers = new Set(local.map((s) => s.ticker));
  const remoteResults = (remote.data?.results ?? []).filter(
    (r) => !localTickers.has(r.symbol.toUpperCase()),
  );

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
        <div className="eyebrow">Recherche · tout le marché</div>
        <h1>
          Trouver une <em>valeur</em>.
        </h1>
      </div>
      <div className="search-bar-wrap">
        <div className="search-bar">
          <Icon name="search" size={16} color="var(--ink-3)" />
          <input
            autoFocus
            type="text"
            placeholder="Ticker ou nom de société (toutes places)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="search-clear" onClick={() => setQ('')}>
              <Icon name="plus" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="section-head">
        <div className="title">{query ? `Univers Monere · ${local.length}` : 'Univers Monere'}</div>
      </div>
      <div className="stock-section">
        {local.map((s) => (
          <SearchResultRow
            key={s.ticker}
            stock={s}
            watched={watch.includes(s.ticker)}
            onToggleWatch={() => toggleWatch.mutate(s.ticker)}
            onOpen={() => nav('stock', { ticker: s.ticker })}
          />
        ))}
        {query && local.length === 0 && (
          <div style={{ padding: '8px 20px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Aucune valeur de l'univers ne correspond.
          </div>
        )}
      </div>

      {query.length >= 2 && (
        <>
          <div className="section-head">
            <div className="title">Tout le marché</div>
            <span className="action" style={{ color: 'var(--ink-3)' }}>
              Recherche temps réel
            </span>
          </div>
          {remote.isLoading ? (
            <LoadingRows count={3} height={44} />
          ) : (
            <div className="stock-section">
              {remoteResults.slice(0, 10).map((r) => (
                <button
                  key={r.symbol}
                  className="stock-row"
                  onClick={() => nav('stock', { ticker: r.symbol })}
                >
                  <StockLogo stock={{ ticker: r.symbol }} />
                  <div className="stock-meta">
                    <div className="tk">{r.symbol}</div>
                    <div className="nm">
                      {r.name}
                      {r.exchange ? ` · ${r.exchange}` : ''}
                    </div>
                  </div>
                  <Icon name="chevron" size={13} color="var(--ink-4)" />
                </button>
              ))}
              {remoteResults.length === 0 && (
                <div style={{ padding: '8px 20px', fontSize: 12.5, color: 'var(--ink-3)' }}>
                  Aucun autre résultat.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchResultRow({
  stock,
  watched,
  onToggleWatch,
  onOpen,
}: {
  stock: DisplayStock;
  watched: boolean;
  onToggleWatch: () => void;
  onOpen: () => void;
}) {
  const up = (stock.changePct ?? 0) >= 0;
  return (
    <div className="stock-row">
      <button
        onClick={onOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 1,
          minWidth: 0,
          border: 0,
          background: 'transparent',
          textAlign: 'left',
          padding: 0,
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <StockLogo stock={stock} />
        <div className="stock-meta">
          <div className="tk">{cleanTicker(stock.ticker)}</div>
          <div className="nm">{stock.name}</div>
        </div>
      </button>
      <div className="stock-price" style={{ marginRight: 2 }}>
        <div className="p num">{fmt(stock.price ?? null, { decimals: 2 })}</div>
        <div className={'d num ' + (up ? 'delta-up' : 'delta-down')}>
          {pct(stock.changePct ?? null)}
        </div>
      </div>
      <button className="iconbtn ghost" onClick={onToggleWatch}>
        <Icon
          name={watched ? 'star-fill' : 'star'}
          size={16}
          color={watched ? 'var(--accent)' : 'var(--ink-3)'}
        />
      </button>
    </div>
  );
}
