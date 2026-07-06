/* HOME — markets overview (real indices + composition + teasers) */
import React from 'react';
import { Icon } from '../components/Icon';
import {
  AppBar,
  Wordmark,
  StockRow,
  IndexChip,
  StockLogo,
  LoadingRows,
  DataUnavailable,
  SourceLine,
} from '../components/ui';
import {
  useIndices,
  useEarningsCalendar,
  useNewsFeed,
  useAlerts,
  useNotifications,
  useUniverse,
} from '../data/hooks';
import { useDisplayStocks } from '../data/display';
import { pct, frDate, cleanTicker, timeAgo } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import type { ScreenProps } from '../state/nav';
import type { NewsItem } from '../lib/types';

const REGIONS = [
  { id: 'US', label: 'États-Unis', color: '#3B82F6' },
  { id: 'EU', label: 'Europe', color: '#6366F1' },
] as const;

export function HomeScreen({ nav }: ScreenProps) {
  const { user } = useAuth();
  const [activeIdx, setActiveIdx] = React.useState('sp500');
  const { data: indicesData, isLoading: indicesLoading } = useIndices();
  const { stocks, loading: stocksLoading } = useDisplayStocks(activeIdx);
  const { data: alertsData } = useAlerts();
  const { data: notifData } = useNotifications();

  const activeAlertCount = (alertsData?.alerts ?? []).filter((a) => a.active).length;
  const unreadCount = notifData?.unread ?? 0;
  const indices = indicesData?.indices ?? [];
  const initials = (user?.email ?? 'M')[0]!.toUpperCase();

  return (
    <div className="screen">
      <AppBar
        left={<Wordmark size={22} />}
        right={
          <>
            <button
              className="iconbtn bell-badge-wrap"
              onClick={() => nav('alerts')}
              title="Alertes de prix"
            >
              <Icon name="target" size={18} />
              {activeAlertCount > 0 && (
                <span className="bell-badge">{activeAlertCount > 9 ? '9+' : activeAlertCount}</span>
              )}
            </button>
            <button className="iconbtn bell-badge-wrap" onClick={() => nav('notifications')}>
              <Icon name="bell" size={18} />
              {unreadCount > 0 && (
                <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            <button className="iconbtn" onClick={() => nav('search')}>
              <Icon name="search" size={18} />
            </button>
            <div
              className="profile-pill"
              style={{ cursor: 'pointer' }}
              onClick={() => nav('account')}
            >
              <div className="av">{initials}</div>
              <div className="name">{user?.email.split('@')[0]}</div>
            </div>
          </>
        }
      />

      <div className="page-head">
        <div className="eyebrow">
          Marchés ·{' '}
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
          })}
        </div>
        <h1>
          Les <em>indices</em>
          <br />
          du jour.
        </h1>
      </div>

      {indicesLoading ? (
        <LoadingRows count={2} height={90} />
      ) : indices.length === 0 ? (
        <DataUnavailable message="Cotations des indices momentanément indisponibles." />
      ) : (
        REGIONS.map((reg, ri) => {
          const items = indices.filter((i) => i.region === reg.id);
          if (!items.length) return null;
          const avg = items.reduce((a, i) => a + (i.pct ?? 0), 0) / items.length;
          return (
            <React.Fragment key={reg.id}>
              <div className="section-head" style={ri === 0 ? { paddingTop: 14 } : undefined}>
                <div className="title">
                  <span className="region-dot" style={{ background: reg.color }} />
                  {reg.label}
                </div>
                <span className="action" style={{ color: avg >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {pct(avg)}
                </span>
              </div>
              <div className="idx-strip">
                {items.map((idx) => (
                  <IndexChip
                    key={idx.id}
                    idx={idx}
                    active={idx.id === activeIdx}
                    onClick={() => setActiveIdx(idx.id)}
                    onOpenDetail={(i) => nav('market', { id: i.id })}
                  />
                ))}
              </div>
            </React.Fragment>
          );
        })
      )}

      <div className="section-head">
        <div className="title">
          {indices.find((i) => i.id === activeIdx)?.name ?? '—'} · Composition
        </div>
        <button className="action" onClick={() => nav('market', { id: activeIdx })}>
          Voir le marché →
        </button>
      </div>

      {stocksLoading ? (
        <LoadingRows count={5} />
      ) : (
        <div className="stock-section">
          {stocks.map((s) => (
            <StockRow
              key={s.ticker}
              stock={s}
              showSpark={false}
              onClick={(st) => nav('stock', { ticker: st.ticker })}
            />
          ))}
        </div>
      )}

      <NextEarningsTeaser nav={nav} />
      <NewsTeaser nav={nav} />
    </div>
  );
}

// ── Teaser: next earnings strip (real calendar) ─────────────
export function NextEarningsTeaser({ nav }: { nav: ScreenProps['nav'] }) {
  const { data: universe } = useUniverse();
  const symbols = React.useMemo(() => (universe?.stocks ?? []).map((s) => s.finnhub), [universe]);
  const { data } = useEarningsCalendar(symbols.length ? symbols : undefined);
  const upcoming = (data?.available ? data.events : [])
    .filter((e) => e.status === 'upcoming')
    .slice(0, 4);
  const stockByFinnhub = new Map((universe?.stocks ?? []).map((s) => [s.finnhub, s]));

  return (
    <>
      <div className="section-head">
        <div className="title">Prochains earnings</div>
        <button className="action" onClick={() => nav('calendar')}>
          Calendrier
        </button>
      </div>
      {data && !data.available ? (
        <DataUnavailable message={data.message} />
      ) : upcoming.length === 0 ? (
        <div style={{ padding: '4px 20px', fontSize: 12.5, color: 'var(--ink-3)' }}>
          Aucune publication programmée dans la fenêtre connue.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '4px 20px 0',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {upcoming.map((e) => {
            const s = stockByFinnhub.get(e.ticker);
            return (
              <button
                key={e.id}
                className="card"
                style={{
                  minWidth: 180,
                  padding: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  borderRadius: 18,
                  textAlign: 'left',
                  flexShrink: 0,
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: 'pointer',
                }}
                onClick={() => nav('earnings', { id: e.id, ticker: e.ticker })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StockLogo
                    stock={{ ticker: e.ticker, domain: s?.domain }}
                    style={{ width: 28, height: 28, fontSize: 10, borderRadius: 8 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
                      {cleanTicker(e.ticker)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                      {frDate(e.date)} ·{' '}
                      {e.when === 'Before open'
                        ? 'Pré-ouverture'
                        : e.when === 'After close'
                          ? 'Après clôture'
                          : 'Horaire à confirmer'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Consensus EPS</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="serif-it" style={{ fontSize: 22 }}>
                    {e.consensus.eps != null ? e.consensus.eps.toFixed(2) : '—'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
                    {e.quarter}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Teaser: top headlines (real feed) ───────────────────────
export function NewsTeaser({ nav }: { nav: ScreenProps['nav'] }) {
  const { data: universe } = useUniverse();
  const symbols = (universe?.stocks ?? []).slice(0, 8).map((s) => s.finnhub);
  const { data } = useNewsFeed(symbols);
  const top = (data?.available ? data.items : []).slice(0, 3);

  return (
    <>
      <div className="section-head">
        <div className="title">Actualités</div>
        <button className="action" onClick={() => nav('news')}>
          Voir tout →
        </button>
      </div>
      {data && !data.available ? (
        <DataUnavailable message={data.message} />
      ) : (
        <div style={{ margin: '0 0 6px' }}>
          {top.map((n) => (
            <NewsFeedRow key={n.id} n={n} nav={nav} />
          ))}
        </div>
      )}
    </>
  );
}

export function NewsFeedRow({ n, nav }: { n: NewsItem; nav: ScreenProps['nav'] }) {
  const { data: universe } = useUniverse();
  const stock = n.ticker
    ? (universe?.stocks ?? []).find((s) => s.finnhub === n.ticker || s.ticker === n.ticker)
    : null;
  const tag = stock ? cleanTicker(stock.ticker) : n.ticker ? cleanTicker(n.ticker) : 'Marché';

  return (
    <button className="news-feed-row" onClick={() => window.open(n.url, '_blank', 'noopener')}>
      {stock ? (
        <StockLogo stock={stock} style={{ width: 44, height: 44, borderRadius: 13 }} />
      ) : (
        <div className="news-feed-macro-ic">
          <Icon name="globe" size={18} color="var(--ink-2)" />
        </div>
      )}
      <div className="news-feed-body">
        <div className="news-feed-top">
          <span className="src">{n.source}</span>
          <span className="dot">·</span>
          <span className="tag">{tag}</span>
          {n.breaking && (
            <span className="news-breaking-tag">
              <Icon name="bolt" size={10} color="#EF4444" />
              Dernière minute
            </span>
          )}
        </div>
        <h4>{n.headline}</h4>
        <div className="time">Il y a {timeAgo(n.publishedAt)}</div>
      </div>
      <Icon name="chevron" size={13} color="var(--ink-4)" />
    </button>
  );
}
