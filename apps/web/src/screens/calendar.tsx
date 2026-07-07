/* CALENDAR — official earnings calendar (past + upcoming), real data */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, StockLogo, LoadingRows, DataUnavailable, SourceLine } from '../components/ui';
import { useEarningsCalendar, useWatchlist, useUniverse } from '../data/hooks';
import { pct, cleanTicker } from '../lib/format';
import type { ScreenProps } from '../state/nav';
import type { CalendarEvent } from '../lib/types';

export function CalendarScreen({ nav }: ScreenProps) {
  const { data: universe } = useUniverse();
  const symbols = React.useMemo(() => (universe?.stocks ?? []).map((s) => s.finnhub), [universe]);
  const { data, isLoading } = useEarningsCalendar(symbols.length ? symbols : undefined);
  const { data: watchData } = useWatchlist();
  const watch = watchData?.tickers ?? [];
  const metaByFinnhub = new Map((universe?.stocks ?? []).map((s) => [s.finnhub, s]));

  const [filter, setFilter] = React.useState<'all' | 'upcoming' | 'past' | 'watch'>('all');
  const filters = [
    { id: 'all', label: 'Tous' },
    { id: 'upcoming', label: 'À venir' },
    { id: 'past', label: 'Passés' },
    { id: 'watch', label: 'Mes favoris' },
  ] as const;
  const [market, setMarket] = React.useState<'all' | 'us' | 'eu'>('all');
  const markets = [
    { id: 'all', label: 'Tous marchés' },
    { id: 'us', label: '🇺🇸 US' },
    { id: 'eu', label: '🇪🇺 Europe' },
  ] as const;

  const events = data?.available ? data.events : [];
  const filtered = events.filter((e) => {
    // Marché : US = symbole sans suffixe de place (.PA, .DE, .L…)
    const isUS = !e.ticker.includes('.');
    if (market === 'us' && !isUS) return false;
    if (market === 'eu' && isUS) return false;
    if (filter === 'upcoming') return e.status === 'upcoming';
    if (filter === 'past') return e.status === 'past';
    if (filter === 'watch') {
      const meta = metaByFinnhub.get(e.ticker);
      return watch.includes(meta?.ticker ?? e.ticker);
    }
    return true;
  });

  const groups: Record<string, CalendarEvent[]> = {};
  filtered.forEach((e) => {
    (groups[e.date] = groups[e.date] || []).push(e);
  });
  const dates = Object.keys(groups).sort();

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
            <Icon name="search" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">Earnings · calendrier officiel</div>
        <h1>
          Le <em>calendrier</em>
          <br />
          des résultats.
        </h1>
        <p className="sub">
          Suis les annonces officielles, le consensus et l'impact réel sur le cours.
        </p>
      </div>

      <div className="filter-pills" style={{ paddingTop: 16 }}>
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
      <div className="filter-pills" style={{ paddingTop: 8 }}>
        {markets.map((m) => (
          <button
            key={m.id}
            className={market === m.id ? 'active' : ''}
            onClick={() => setMarket(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows count={5} />
      ) : data && !data.available ? (
        <DataUnavailable message={data.message} />
      ) : dates.length === 0 ? (
        <div className="watchlist-empty">Aucun résultat avec ce filtre.</div>
      ) : (
        dates.map((dateStr) => {
          const d = new Date(dateStr);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isFuture = d >= today;
          return (
            <div className="cal-day" key={dateStr}>
              <div className="day-head">
                <span className="num">{d.getDate()}</span>
                <span className="lbl">
                  {d.toLocaleDateString('fr-FR', { month: 'short', weekday: 'short' })}
                </span>
                <span className="when">
                  {isFuture ? 'À venir · ' : 'Passé · '}
                  {d.toLocaleDateString('fr-FR', { year: 'numeric' })}
                </span>
              </div>
              {groups[dateStr]!.map((e) => (
                <EarningsCalendarRow
                  key={e.id}
                  earnings={e}
                  nav={nav}
                  domain={metaByFinnhub.get(e.ticker)?.domain}
                  name={metaByFinnhub.get(e.ticker)?.name}
                />
              ))}
            </div>
          );
        })
      )}

      {events[0] && (
        <SourceLine
          source={{ name: 'Finnhub — earnings calendar (officiel)', url: 'https://finnhub.io' }}
        />
      )}
    </div>
  );
}

export function EarningsCalendarRow({
  earnings: e,
  nav,
  domain,
  name,
}: {
  earnings: CalendarEvent;
  nav: ScreenProps['nav'];
  domain?: string | null;
  name?: string;
}) {
  const isUpcoming = e.status === 'upcoming';
  const epsSurprise = e.surprise?.eps ? parseFloat(e.surprise.eps) : null;
  const daysTo = Math.max(0, Math.ceil((new Date(e.date).getTime() - Date.now()) / 86_400_000));
  return (
    <button className="earning-row" onClick={() => nav('earnings', { id: e.id, ticker: e.ticker })}>
      <StockLogo stock={{ ticker: e.ticker, domain }} />
      <div className="info">
        <div className="tk">
          {cleanTicker(e.ticker)}{' '}
          <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 11.5, marginLeft: 4 }}>
            {e.quarter}
          </span>
        </div>
        <div className="nm">
          {e.when === 'Before open'
            ? '🌅 Pré-ouverture'
            : e.when === 'After close'
              ? '🌙 Après clôture'
              : '🕓 Horaire à confirmer'}
          {name ? ` · ${name}` : ''}
        </div>
      </div>
      <div className="pred">
        {isUpcoming ? (
          <>
            <div>{daysTo === 0 ? "Aujourd'hui" : `Dans ${daysTo} j`} · Consensus EPS</div>
            <div className="conf beat">
              {e.consensus.eps != null ? e.consensus.eps.toFixed(2) : '—'}
            </div>
          </>
        ) : (
          <>
            <div>Surprise EPS</div>
            <div className={'conf ' + ((epsSurprise ?? 0) >= 0 ? 'beat' : 'miss')}>
              {e.surprise?.eps ?? '—'}
            </div>
          </>
        )}
      </div>
    </button>
  );
}
