/* EARNINGS DETAIL — official figures, real ±1-day price impact, beat history,
   IR link to follow the call. No invented predictions: the "tendance" shown is
   a transparent statistic computed from the company's own surprise history. */
import React from 'react';
import { Icon } from '../components/Icon';
import {
  AppBar,
  StockLogo,
  ActionSheet,
  SourceLine,
  DataUnavailable,
  LoadingRows,
} from '../components/ui';
import { EpsSpreadBar } from '../components/charts';
import { useCompanyEarnings, useEarningsAlerts, useEarningsAlertMutations } from '../data/hooks';
import { useStockMeta } from '../data/display';
import { pct, frDate, cleanTicker } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import type { ScreenProps } from '../state/nav';
import type { CalendarEvent } from '../lib/types';

export function EarningsDetailScreen({
  nav,
  params,
  openPaywall,
}: ScreenProps & { openPaywall: () => void }) {
  const ticker = (params.ticker ?? '').toUpperCase();
  const meta = useStockMeta(ticker);
  const { user } = useAuth();
  const isPremium = Boolean(user?.premium);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const { data, isLoading } = useCompanyEarnings(ticker);
  const { data: alertsData } = useEarningsAlerts();
  const { toggle: toggleEarningsAlert } = useEarningsAlertMutations();

  if (isLoading) {
    return (
      <div className="screen">
        <AppBar
          left={
            <button className="iconbtn" onClick={() => nav('calendar')}>
              <Icon name="back" size={18} />
            </button>
          }
        />
        <LoadingRows count={4} height={90} />
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div className="screen">
        <AppBar
          left={
            <button className="iconbtn" onClick={() => nav('calendar')}>
              <Icon name="back" size={18} />
            </button>
          }
        />
        <DataUnavailable message={data?.message} />
      </div>
    );
  }

  const all: CalendarEvent[] = [...data.upcoming, ...data.past];
  const earning =
    all.find((e) => e.id === params.id) ?? data.upcoming[0] ?? data.past[data.past.length - 1];
  if (!earning) {
    return (
      <div className="screen">
        <AppBar
          left={
            <button className="iconbtn" onClick={() => nav('calendar')}>
              <Icon name="back" size={18} />
            </button>
          }
        />
        <DataUnavailable message="Aucun événement earnings connu pour cette valeur." />
      </div>
    );
  }

  const isUpcoming = earning.status === 'upcoming';
  const d = new Date(earning.date);
  const activeAlert = (alertsData?.alerts ?? []).find(
    (a) => a.ticker === ticker && a.eventDate.slice(0, 10) === earning.date,
  );
  const stats = data.history?.stats;
  const cur = (meta?.currency ?? 'USD') === 'USD' ? '$' : '€';
  const epsSurprise = earning.surprise?.eps ? parseFloat(earning.surprise.eps) : null;
  const outcomeBeat = epsSurprise != null && epsSurprise >= 0;

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn" onClick={() => nav('calendar')}>
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={18} />
          </button>
        }
      />
      <div className="page-head">
        <div className="eyebrow">
          {isUpcoming ? 'À venir' : 'Passé'} · {earning.quarter}
        </div>
        <h1>
          <em>Earnings</em>
          <br />
          {(meta?.name ?? cleanTicker(ticker)).split(' ')[0]}
        </h1>
      </div>

      <div className="earn-hero">
        <div className="head">
          <StockLogo stock={{ ticker, domain: meta?.domain }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
              {cleanTicker(ticker)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {d.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          </div>
          <div className="quarter">
            {earning.when === 'Before open'
              ? 'Pré-ouverture'
              : earning.when === 'After close'
                ? 'Après clôture'
                : 'Horaire à confirmer'}
          </div>
        </div>

        {isUpcoming ? (
          <>
            <h3>
              Le consensus attend{' '}
              <em>
                EPS&nbsp;{earning.consensus.eps != null ? earning.consensus.eps.toFixed(2) : '—'}
                &nbsp;{cur}
              </em>
              .
            </h3>
            <div className="when" style={{ marginTop: 4 }}>
              Revenu attendu ·{' '}
              {earning.consensus.revenue != null
                ? `${earning.consensus.revenue.toFixed(2)} Md ${cur}`
                : 'non communiqué'}
            </div>
            {stats && stats.beatRatePct != null && (
              <div className="confidence">
                <div className="row">
                  <span className="l">Tendance historique (stat. réelle)</span>
                  <span
                    className="r"
                    style={{
                      color:
                        stats.tendency === 'beat'
                          ? 'var(--pos)'
                          : stats.tendency === 'miss'
                            ? 'var(--neg)'
                            : 'var(--ink-2)',
                    }}
                  >
                    {stats.tendency === 'beat'
                      ? 'Bat souvent'
                      : stats.tendency === 'miss'
                        ? 'Manque souvent'
                        : 'En ligne'}
                    {stats.avgSurprisePct != null
                      ? ` · surprise moy. ${pct(stats.avgSurprisePct, { decimals: 1 })}`
                      : ''}
                  </span>
                </div>
                <div className="conf-bar">
                  <div className="conf-fill" style={{ width: stats.beatRatePct + '%' }} />
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="l">
                    {stats.beats} beats / {stats.quarters} derniers trimestres
                  </span>
                  <span className="r">{stats.beatRatePct}%</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h3>
              {earning.actual?.eps != null ? (
                <span>
                  <em>{outcomeBeat ? 'Battu :' : 'Manqué :'}</em> {earning.actual.eps.toFixed(2)}
                  &nbsp;{cur}
                </span>
              ) : (
                <span>Résultat non encore publié</span>
              )}
            </h3>
            <div className="when" style={{ marginTop: 4 }}>
              vs consensus EPS&nbsp;
              {earning.consensus.eps != null ? earning.consensus.eps.toFixed(2) : '—'}
              {earning.surprise?.eps ? ` (${earning.surprise.eps})` : ''}
            </div>

            {earning.actual?.eps != null && earning.consensus.eps != null && (
              <div style={{ marginTop: 16 }}>
                <EpsSpreadBar
                  low={Math.min(earning.consensus.eps, earning.actual.eps) * 0.92}
                  high={Math.max(earning.consensus.eps, earning.actual.eps) * 1.08}
                  consensus={earning.consensus.eps}
                  actual={earning.actual.eps}
                />
              </div>
            )}
          </>
        )}
        {isUpcoming && (
          <button
            className={'cta' + (activeAlert ? '' : ' accent')}
            style={{ width: '100%', marginTop: 14 }}
            disabled={toggleEarningsAlert.isPending}
            onClick={() =>
              toggleEarningsAlert.mutate({
                ticker,
                eventDate: earning.date,
                quarter: earning.quarter,
              })
            }
          >
            <Icon
              name={activeAlert ? 'check' : 'bell'}
              size={16}
              color={activeAlert ? 'var(--ink)' : '#fff'}
            />
            {activeAlert
              ? 'Rappel programmé · e-mail 1 semaine avant — toucher pour annuler'
              : "M'alerter par e-mail 1 semaine avant"}
          </button>
        )}
        <SourceLine source={earning.source} />
      </div>

      {/* Suivre le call — lien IR officiel */}
      {data.ir && (
        <>
          <div className="section-head">
            <div className="title">Suivre la publication</div>
          </div>
          <button
            className="earning-row"
            style={{ margin: '0 20px' }}
            onClick={() => window.open(data.ir!.url, '_blank', 'noopener')}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="arrow-ne" size={18} />
            </div>
            <div className="info">
              <div className="tk">{data.ir.name}</div>
              <div className="nm">Webcast, communiqués et transcriptions officiels</div>
            </div>
            <Icon name="chevron" size={14} color="var(--ink-4)" />
          </button>
        </>
      )}

      {/* Past: real price impact (computed from real candles) */}
      {!isUpcoming && earning.priceImpact && (
        <>
          <div className="section-head">
            <div className="title">Impact réel sur le cours</div>
          </div>
          <div className="ratio-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="ratio-cell">
              <div className="lbl">J-1 → J (clôtures)</div>
              <div
                className="v"
                style={{
                  color: (earning.priceImpact.d1Pct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              >
                {pct(earning.priceImpact.d1Pct)}
              </div>
              <div className="delta-sub" style={{ color: 'var(--ink-3)' }}>
                Première séance
              </div>
            </div>
            <div className="ratio-cell">
              <div className="lbl">J-1 → J+1 (fenêtre 2j)</div>
              <div
                className="v"
                style={{
                  color: (earning.priceImpact.d2Pct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              >
                {pct(earning.priceImpact.d2Pct)}
              </div>
              <div className="delta-sub" style={{ color: 'var(--ink-3)' }}>
                Réaction du marché
              </div>
            </div>
          </div>
          <SourceLine source={earning.priceImpact.source} prefix="Cours" />
        </>
      )}

      {/* Historique des surprises EPS (réel) */}
      {data.history && (
        <>
          <div className="section-head">
            <div className="title">Historique battre / manquer</div>
            {!isPremium && data.history.rows.length > 2 && (
              <span className="mini-pill new">Premium</span>
            )}
          </div>
          <div className="eps-grid">
            {(isPremium ? data.history.rows : data.history.rows.slice(0, 2)).map((r, i) => {
              const beat =
                r.epsActual != null && r.epsEstimate != null && r.epsActual >= r.epsEstimate;
              return (
                <div className="analyst-row" key={i}>
                  <span className="firm">{r.quarter}</span>
                  <span className="v">
                    {r.epsActual != null ? `${cur}${r.epsActual.toFixed(2)}` : '—'}{' '}
                    <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>
                      vs {r.epsEstimate != null ? r.epsEstimate.toFixed(2) : '—'}
                    </span>
                  </span>
                  <span className={'rating ' + (beat ? 'buy' : 'sell')}>
                    {r.surprisePct != null ? pct(r.surprisePct, { decimals: 1 }) : '—'}
                  </span>
                </div>
              );
            })}
            {!isPremium && data.history.rows.length > 2 && (
              <div className="transcript-locked" style={{ padding: '18px 16px 20px' }}>
                <div className="transcript-locked-cta">
                  <Icon name="lock" size={18} color="var(--ink-2)" />
                  <div className="lbl">
                    +{data.history.rows.length - 2} trimestres d'historique détaillé
                  </div>
                  <button className="cta accent" onClick={openPaywall}>
                    Passer à Premium
                  </button>
                </div>
              </div>
            )}
          </div>
          <SourceLine source={data.history.source} />
        </>
      )}

      {/* Impacts des derniers prints */}
      {!isUpcoming
        ? null
        : data.past.length > 0 && (
            <>
              <div className="section-head">
                <div className="title">Impact des précédents earnings (J-1 → J+1)</div>
              </div>
              <div className="eps-grid">
                {data.past
                  .slice(-4)
                  .reverse()
                  .map((e, i) => (
                    <div className="analyst-row" key={i}>
                      <span className="firm">
                        {e.quarter} · {frDate(e.date)}
                      </span>
                      <span className="v">{e.surprise?.eps ?? '—'}</span>
                      <span
                        className={'rating ' + ((e.priceImpact?.d2Pct ?? 0) >= 0 ? 'buy' : 'sell')}
                      >
                        {pct(e.priceImpact?.d2Pct ?? null, { decimals: 1 })}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}

      {/* CTA */}
      <div className="simulate-cta">
        <button className="secondary" onClick={() => nav('stock', { ticker })}>
          Voir la valeur
        </button>
        <button
          className="primary"
          onClick={() => nav('simulator', { ticker, around: earning.id })}
        >
          <Icon name="sim" size={16} color="var(--bg)" />
          Simuler une stratégie
        </button>
      </div>

      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={earning.quarter}
        items={[
          ...(data.ir
            ? [
                {
                  icon: 'arrow-ne',
                  label: 'Page investisseurs officielle',
                  onClick: () => window.open(data.ir!.url, '_blank', 'noopener'),
                },
              ]
            : []),
          {
            icon: 'news',
            label: 'Ouvrir la source du calendrier',
            onClick: () => window.open(earning.source.url, '_blank', 'noopener'),
          },
        ]}
      />
    </div>
  );
}
