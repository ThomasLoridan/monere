/* Native desktop shell + tablet shell — ported from desktop-shell.jsx,
   widgets wired to real data */
import React from 'react';
import { Icon } from '../components/Icon';
import { Wordmark, StockLogo } from '../components/ui';
import { useTweaks } from '../state/tweaks';
import { useAuth } from '../auth/AuthContext';
import { useIndices, useEarningsCalendar, useNewsFeed, useUniverse } from '../data/hooks';
import { useDisplayStocks } from '../data/display';
import { pct, frDate, cleanTicker } from '../lib/format';
import type { Nav } from '../state/nav';

const DN_TABS = [
  { id: 'home', label: 'Marchés', icon: 'home' },
  { id: 'watch', label: 'Favoris', icon: 'star' },
  { id: 'calendar', label: 'Earnings', icon: 'cal' },
  { id: 'smart', label: 'Suivi', icon: 'users' },
  { id: 'settings', label: 'Réglages', icon: 'cog' },
] as const;

export function DesktopNativeShell({
  currentTab,
  goTab,
  nav,
  appBody,
  isAuthFlow,
}: {
  currentTab: string;
  goTab: (id: string) => void;
  nav: Nav;
  appBody: React.ReactNode;
  isAuthFlow: boolean;
}) {
  const { tweaks, setTweak } = useTweaks();
  const { user } = useAuth();

  if (isAuthFlow) {
    return (
      <div className="dn-shell dn-shell-auth">
        <div className="dn-auth-stage">{appBody}</div>
      </div>
    );
  }
  return (
    <div className="dn-shell">
      <aside className="dn-sidebar">
        <div className="dn-brand">
          <Wordmark size={22} />
        </div>

        <nav className="dn-nav">
          {DN_TABS.map((t) => (
            <button
              key={t.id}
              className={'dn-nav-item ' + (currentTab === t.id ? 'active' : '')}
              onClick={() => goTab(t.id)}
              title={t.label}
            >
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <button
          className="dn-nav-item"
          onClick={() => setTweak('dark', !tweaks.dark)}
          title={tweaks.dark ? 'Mode clair' : 'Mode sombre'}
        >
          <Icon name={tweaks.dark ? 'sun' : 'moon'} size={18} />
          <span>{tweaks.dark ? 'Mode clair' : 'Mode sombre'}</span>
        </button>

        <div
          className="dn-sidebar-footer"
          style={{ cursor: 'pointer' }}
          onClick={() => nav('account')}
          title="Compte"
        >
          <div className="dn-avatar">{(user?.email ?? 'M').slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="dn-name">{user?.email.split('@')[0]}</div>
            <div className="dn-plan">{user?.premium ? 'Monere Premium' : 'Compte gratuit'}</div>
          </div>
        </div>
      </aside>

      <div className="dn-main">
        <div className="dn-content-card">{appBody}</div>
        <aside className="dn-right">
          <DesktopWidgets nav={nav} />
        </aside>
      </div>
    </div>
  );
}

function DesktopWidgets({ nav }: { nav: Nav }) {
  const { stocks } = useDisplayStocks();
  const { data: indicesData } = useIndices();
  const { data: universe } = useUniverse();
  const symbols = (universe?.stocks ?? []).map((s) => s.finnhub);
  const { data: earningsData } = useEarningsCalendar(symbols.length ? symbols : undefined);
  const { data: newsData } = useNewsFeed(symbols.slice(0, 6));

  const movers = [...stocks]
    .filter((s) => s.changePct != null)
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
    .slice(0, 4);
  const upcoming = (earningsData?.available ? earningsData.events : [])
    .filter((e) => e.status === 'upcoming')
    .slice(0, 3);
  const headlines = (newsData?.available ? newsData.items : []).slice(0, 4);

  return (
    <>
      <div className="dn-widget">
        <div className="dn-widget-title">Plus fortes variations</div>
        {movers.map((s) => {
          const up = (s.changePct ?? 0) >= 0;
          return (
            <button
              key={s.ticker}
              className="dn-widget-row"
              onClick={() => nav('stock', { ticker: s.ticker })}
            >
              <StockLogo
                stock={s}
                style={{ width: 26, height: 26, fontSize: 10, borderRadius: 8 }}
              />
              <span className="dn-widget-tk">{cleanTicker(s.ticker)}</span>
              <span className={'dn-widget-d num ' + (up ? 'delta-up' : 'delta-down')}>
                {pct(s.changePct)}
              </span>
            </button>
          );
        })}
        <button className="dn-widget-foot" onClick={() => nav('home')}>
          Voir les marchés →
        </button>
      </div>

      <div className="dn-widget">
        <div className="dn-widget-title">Prochains earnings</div>
        {upcoming.map((e) => (
          <button
            key={e.id}
            className="dn-widget-row"
            onClick={() => nav('earnings', { id: e.id, ticker: e.ticker })}
          >
            <StockLogo
              stock={{ ticker: e.ticker }}
              style={{ width: 26, height: 26, fontSize: 10, borderRadius: 8 }}
            />
            <span className="dn-widget-tk">{cleanTicker(e.ticker)}</span>
            <span className="dn-widget-meta">{frDate(e.date)}</span>
          </button>
        ))}
        <button className="dn-widget-foot" onClick={() => nav('calendar')}>
          Voir le calendrier →
        </button>
      </div>

      <div className="dn-widget">
        <div className="dn-widget-title">Indices</div>
        {(indicesData?.indices ?? []).slice(0, 4).map((idx) => {
          const up = (idx.pct ?? 0) >= 0;
          return (
            <button
              key={idx.id}
              className="dn-widget-row"
              onClick={() => nav('market', { id: idx.id })}
            >
              <span className="dn-widget-tk" style={{ flex: 1 }}>
                {idx.name}
              </span>
              <span className={'dn-widget-d num ' + (up ? 'delta-up' : 'delta-down')}>
                {pct(idx.pct)}
              </span>
            </button>
          );
        })}
        <button className="dn-widget-foot" onClick={() => nav('home')}>
          Voir tous les indices →
        </button>
      </div>

      <div className="dn-widget">
        <div className="dn-widget-title">Actualités</div>
        {headlines.map((n) => (
          <button
            key={n.id + n.url}
            className="dn-widget-row"
            onClick={() => window.open(n.url, '_blank', 'noopener')}
          >
            <span
              className="dn-widget-tk"
              style={{ flex: 1, fontWeight: 400, whiteSpace: 'normal', lineHeight: 1.3 }}
            >
              {n.headline}
            </span>
          </button>
        ))}
        <button className="dn-widget-foot" onClick={() => nav('news')}>
          Voir tout le fil →
        </button>
      </div>
    </>
  );
}

export function TabletShell({
  currentTab,
  goTab,
  nav,
  appBody,
  isAuthFlow,
}: {
  currentTab: string;
  goTab: (id: string) => void;
  nav: Nav;
  appBody: React.ReactNode;
  isAuthFlow: boolean;
}) {
  const { tweaks, setTweak } = useTweaks();
  const { user } = useAuth();

  if (isAuthFlow) {
    return (
      <div className="dn-shell dn-shell-auth">
        <div className="tb-auth-stage">{appBody}</div>
      </div>
    );
  }
  return (
    <div className="tb-shell">
      <aside className="tb-rail">
        <div className="dn-brand">
          <Wordmark size={20} />
        </div>
        <nav className="tb-nav">
          {DN_TABS.map((t) => (
            <button
              key={t.id}
              className={'tb-nav-item ' + (currentTab === t.id ? 'active' : '')}
              onClick={() => goTab(t.id)}
              title={t.label}
            >
              <Icon name={t.icon} size={19} />
            </button>
          ))}
        </nav>
        <button
          className="tb-nav-item"
          onClick={() => setTweak('dark', !tweaks.dark)}
          title={tweaks.dark ? 'Mode clair' : 'Mode sombre'}
        >
          <Icon name={tweaks.dark ? 'sun' : 'moon'} size={19} />
        </button>
        <button className="tb-avatar" onClick={() => nav('account')} title="Compte">
          <div className="dn-avatar">{(user?.email ?? 'M').slice(0, 2).toUpperCase()}</div>
        </button>
      </aside>

      <div className="tb-content">{appBody}</div>
    </div>
  );
}
