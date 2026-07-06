/* PRICE ALERTS — server-persisted, evaluated by the market service every 30s */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, StockLogo, SettingsSwitch, AlertCreateSheet, LoadingRows } from '../components/ui';
import { useAlerts, useAlertMutations, useLiveQuotes } from '../data/hooks';
import { useDisplayStocks } from '../data/display';
import { fmt, cleanTicker } from '../lib/format';
import type { ScreenProps } from '../state/nav';
import type { DisplayStock } from '../components/ui';

export function AlertsScreen({ nav }: ScreenProps) {
  const { data, isLoading } = useAlerts();
  const { add, toggle, remove } = useAlertMutations();
  const { stocks } = useDisplayStocks();
  const alerts = data?.alerts ?? [];
  const alertQuotes = useLiveQuotes(alerts.map((a) => a.ticker));

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState('');
  const [creatingFor, setCreatingFor] = React.useState<DisplayStock | null>(null);

  const q = pickerQuery.trim().toLowerCase();
  const filtered = q
    ? stocks.filter((s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    : stocks;

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn ghost" onClick={() => nav('settings')}>
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={() => setPickerOpen(true)}>
            <Icon name="plus" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">
          Réglages · {alerts.length} alerte{alerts.length > 1 ? 's' : ''}
        </div>
        <h1>
          Alertes
          <br />
          sur <em>mesure</em>.
        </h1>
        <p className="sub">Prix franchi — vérifié toutes les 30 secondes sur les cours réels.</p>
      </div>

      <div style={{ padding: '4px 20px 0' }}>
        <button className="cta accent" onClick={() => setPickerOpen(true)}>
          <Icon name="plus" size={16} color="#fff" /> Nouvelle alerte
        </button>
      </div>

      {isLoading ? (
        <LoadingRows count={3} height={64} />
      ) : alerts.length === 0 ? (
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
            Aucune alerte
          </div>
          <div style={{ fontSize: 13 }}>
            Touche le bouton ci-dessus pour créer ta première alerte de prix.
          </div>
        </div>
      ) : (
        <div style={{ margin: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map((a) => {
            const quote = alertQuotes.get(a.ticker);
            const meta = stocks.find((s) => s.ticker === a.ticker);
            const price = quote?.price ?? null;
            const triggered =
              a.triggeredAt != null ||
              (price != null && (a.direction === 'above' ? price >= a.target : price <= a.target));
            return (
              <div key={a.id} className="alert-row">
                <StockLogo stock={{ ticker: a.ticker, domain: meta?.domain }} />
                <div
                  className="alert-row-main"
                  onClick={() => nav('stock', { ticker: a.ticker })}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="alert-row-top">
                    <span className="alert-row-tk">{cleanTicker(a.ticker)}</span>
                    <span className={'badge ' + (triggered ? 'pos' : 'neutral')}>
                      {triggered ? 'Déclenchée' : 'En veille'}
                    </span>
                  </div>
                  <div className="alert-row-sub">
                    {a.direction === 'above' ? 'Au-dessus de' : 'En dessous de'}{' '}
                    {fmt(a.target, { decimals: 2 })} {quote?.currency ?? ''}
                    {price != null ? ` · actuellement ${fmt(price, { decimals: 2 })}` : ''}
                  </div>
                </div>
                <div className="alert-row-actions">
                  <SettingsSwitch
                    on={a.active}
                    onChange={(v) => toggle.mutate({ id: a.id, active: v })}
                  />
                  <button className="iconbtn ghost" onClick={() => remove.mutate(a.id)}>
                    <Icon name="trash" size={16} color="var(--neg)" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <>
          <div
            className="sheet-backdrop"
            onClick={() => {
              setPickerOpen(false);
              setPickerQuery('');
            }}
          />
          <div className="sheet" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            <div className="sheet-title">Choisir une valeur</div>
            <div style={{ padding: '2px 4px 8px' }}>
              <div className="search-bar">
                <Icon name="search" size={16} color="var(--ink-3)" />
                <input
                  autoFocus
                  placeholder="Ticker ou nom…"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                />
              </div>
            </div>
            {filtered.slice(0, 8).map((s) => (
              <button
                key={s.ticker}
                className="sheet-item"
                onClick={() => {
                  setPickerOpen(false);
                  setPickerQuery('');
                  setCreatingFor(s);
                }}
              >
                <StockLogo
                  stock={s}
                  style={{ width: 28, height: 28, fontSize: 10, borderRadius: 8 }}
                />
                <span>
                  {cleanTicker(s.ticker)} · {s.name}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 16px 16px', fontSize: 13, color: 'var(--ink-3)' }}>
                Aucun résultat.
              </div>
            )}
          </div>
        </>
      )}

      <AlertCreateSheet
        open={!!creatingFor}
        stock={creatingFor}
        onClose={() => setCreatingFor(null)}
        onCreate={(a) => add.mutate(a)}
      />
    </div>
  );
}
