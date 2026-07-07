/* STOCK DETAIL — real quote, real candles (progressive 1D), real ratios,
   real news with links, AI digest of market-moving headlines */
import React from 'react';
import { Icon } from '../components/Icon';
import {
  AppBar,
  StockLogo,
  AnimatedNumber,
  ActionSheet,
  AlertCreateSheet,
  ChartTypeToggle,
  DelayedBadge,
  SourceLine,
  DataUnavailable,
  LoadingRows,
} from '../components/ui';
import { BigChart } from '../components/charts';
import {
  useQuote,
  useCandles,
  useProfile,
  useCompanyNews,
  useCompanyEarnings,
  useWatchlist,
  useToggleWatch,
  useAlertMutations,
  useNewsDigest,
  useAiStatus,
} from '../data/hooks';
import { useStockMeta } from '../data/display';
import { useTweaks } from '../state/tweaks';
import { fmt, pct, cleanTicker, timeAgo, frDate } from '../lib/format';
import type { ScreenProps } from '../state/nav';

const RATIO_INFO: Record<string, { label: string; formula: string; meaning: string }> = {
  pe: {
    label: 'P/E — Price / Earnings',
    formula: "Cours de l'action ÷ Bénéfice par action (EPS)",
    meaning:
      'Combien les investisseurs paient pour 1€ de bénéfice annuel. Un P/E élevé traduit des attentes de croissance fortes (ou une survalorisation) ; un P/E bas peut signaler une décote ou une croissance jugée faible.',
  },
  peg: {
    label: 'PEG — P/E ajusté à la croissance',
    formula: 'P/E ÷ Taux de croissance annuel des bénéfices (%)',
    meaning:
      "Corrige le P/E par la croissance attendue. PEG ≈ 1 suggère une valorisation équilibrée par rapport à la croissance ; au-delà de 2, l'action est souvent jugée chère relativement à sa croissance.",
  },
  eps: {
    label: 'EPS — Bénéfice par action',
    formula: "Bénéfice net ÷ Nombre d'actions en circulation",
    meaning:
      "La part du profit qui revient à chaque action. C'est la base de calcul du P/E et l'indicateur le plus suivi lors des publications de résultats (battre ou manquer le consensus EPS).",
  },
  divYield: {
    label: 'Rendement du dividende',
    formula: "Dividende annuel par action ÷ Cours de l'action × 100",
    meaning:
      "Le revenu annuel versé aux actionnaires, en % du cours actuel. Utile pour comparer le rendement 'cash' d'une action à d'autres placements, mais un rendement très élevé peut aussi signaler un cours en difficulté.",
  },
  beta: {
    label: 'Beta — Volatilité vs marché',
    formula: 'Covariance(rendement action, rendement marché) ÷ Variance(rendement marché)',
    meaning:
      'Mesure la sensibilité du titre aux mouvements du marché. Beta = 1 : évolue comme le marché. > 1 : amplifie les mouvements (plus risqué/volatil). < 1 : plus défensif.',
  },
  marketCap: {
    label: 'Capitalisation boursière',
    formula: "Cours de l'action × Nombre d'actions en circulation",
    meaning:
      "La valeur totale de l'entreprise selon le marché. Elle détermine sa catégorie (large cap, mid cap…) et son poids dans les indices qu'elle compose.",
  },
  high52: {
    label: 'Plus haut 52 semaines',
    formula: 'Cours de clôture le plus élevé sur les 365 derniers jours',
    meaning:
      "Repère technique souvent surveillé : un titre qui s'en approche ou le dépasse est perçu comme en dynamique haussière forte.",
  },
  low52: {
    label: 'Plus bas 52 semaines',
    formula: 'Cours de clôture le plus bas sur les 365 derniers jours',
    meaning:
      'Repère technique inverse du plus haut : une approche de ce niveau peut signaler une faiblesse prolongée ou une opportunité de valorisation basse, selon le contexte.',
  },
};

function RatioCell({
  label,
  value,
  hint,
  small = false,
  onInfo,
}: {
  label: string;
  value: string | number | null;
  hint: string;
  small?: boolean;
  onInfo: () => void;
}) {
  return (
    <button className="ratio-cell" onClick={onInfo}>
      <div className="ratio-info-badge">
        <Icon name="info" size={11} color="var(--accent)" strokeWidth={2} />
      </div>
      <div className="lbl">{label}</div>
      <div className={'v' + (small ? ' small' : '')}>
        {value == null ? '—' : typeof value === 'number' ? value.toFixed(2) : value}
      </div>
      <div className="delta-sub" style={{ color: 'var(--ink-3)' }}>
        {hint}
      </div>
    </button>
  );
}

function marketCapFmt(mcapMillions: number | null): string | null {
  if (mcapMillions == null) return null;
  if (mcapMillions >= 1e6) return (mcapMillions / 1e6).toFixed(2) + ' T';
  if (mcapMillions >= 1e3) return (mcapMillions / 1e3).toFixed(0) + ' Md';
  return mcapMillions.toFixed(0) + ' M';
}

export function StockDetailScreen({ nav, params }: ScreenProps) {
  const ticker = (params.ticker ?? '').toUpperCase();
  const meta = useStockMeta(ticker);
  const { tweaks, setTweak } = useTweaks();
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [ratioInfo, setRatioInfo] = React.useState<string | null>(null);
  const [range, setRange] = React.useState('1D');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [digestWanted, setDigestWanted] = React.useState(false);
  const ranges = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

  const { data: quoteData } = useQuote(ticker);
  const { data: candles, isLoading: candlesLoading } = useCandles(ticker, range);
  const { data: profile } = useProfile(ticker);
  const { data: news, isLoading: newsLoading } = useCompanyNews(meta?.finnhub ?? ticker);
  const { data: earnings } = useCompanyEarnings(meta?.finnhub ?? ticker);
  const { data: watchData } = useWatchlist();
  const toggleWatch = useToggleWatch();
  const { add: addAlert } = useAlertMutations();
  const { data: aiStatus } = useAiStatus();
  // Symbole de place (ex. MC.PA) — un ticker nu comme « MC » désignerait
  // une autre société chez Yahoo/Finnhub (Moelis & Co) et fausserait les news.
  const digest = useNewsDigest(meta?.finnhub ?? ticker, meta?.name ?? null, digestWanted);

  const quote = quoteData?.quote;
  const name = meta?.name ?? quote?.name ?? ticker;
  const currency = quote?.currency ?? meta?.currency ?? 'USD';
  const isWatched = (watchData?.tickers ?? []).includes(ticker);
  const up = (quote?.changePct ?? 0) >= 0;
  const ratios = profile?.ratios ?? null;

  const points = candles?.points ?? [];
  const closes = points.map((p) => p.c).filter((c): c is number => c != null);
  // Fin de fenêtre : dernier cours connu (meta Yahoo, plus frais que la dernière bougie).
  // Base : clôture de la veille en 1D (même référence que la variation du jour),
  // premier point de la fenêtre sinon — l'en-tête et le graphe racontent la même chose.
  const rangeEnd = candles?.price ?? (closes.length ? closes[closes.length - 1]! : null);
  const rangeBase =
    range === '1D'
      ? (candles?.previousClose ?? quote?.previousClose ?? null)
      : closes.length > 1
        ? closes[0]!
        : null;
  const rangeChange =
    rangeEnd != null && rangeBase != null && rangeBase !== 0
      ? ((rangeEnd - rangeBase) / rangeBase) * 100
      : null;
  const rangeAbs = rangeEnd != null && rangeBase != null ? rangeEnd - rangeBase : null;

  const nextEarning = earnings?.available ? earnings.upcoming[0] : undefined;
  const beatStats = earnings?.available ? earnings.history?.stats : undefined;

  const displayStock = {
    ticker,
    name,
    domain: meta?.domain,
    price: quote?.price ?? null,
    currency,
    changePct: quote?.changePct ?? null,
  };

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn" onClick={() => nav('home')}>
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <>
            <button className="iconbtn" onClick={() => toggleWatch.mutate(ticker)}>
              <Icon
                name={isWatched ? 'star-fill' : 'star'}
                size={18}
                color={isWatched ? 'var(--accent)' : 'currentColor'}
              />
            </button>
            <button className="iconbtn" onClick={() => setAlertOpen(true)}>
              <Icon name="bell" size={18} />
            </button>
            <button className="iconbtn" onClick={() => setMoreOpen(true)}>
              <Icon name="more" size={18} />
            </button>
          </>
        }
      />

      <div className="detail-hero">
        <div className="tk-row">
          <StockLogo stock={{ ticker, domain: meta?.domain }} />
          <div>
            <h2>
              {cleanTicker(ticker)}
              <DelayedBadge delayed={quote?.delayed} />
            </h2>
            <div className="sub-name">
              {name}
              {meta ? ` · ${meta.exchange}` : ''}
            </div>
          </div>
        </div>
        <div className="price-big">
          <span className="p num">
            {quote ? (
              <AnimatedNumber value={quote.price} decimals={2} enabled={tweaks.animateNums} />
            ) : (
              '—'
            )}
          </span>
          <span className="cur">{currency}</span>
        </div>
        <div
          className={
            'change-pill ' + ((range === '1D' ? up : (rangeChange ?? 0) >= 0) ? 'up' : 'down')
          }
        >
          <span className="dot" />
          <span className="num">
            {range === '1D' ? (
              <>
                {pct(quote?.changePct ?? null)} ·{' '}
                {fmt(quote?.change ?? null, { sign: true, decimals: 2 })} aujourd'hui
              </>
            ) : (
              <>
                {pct(rangeChange)} · {fmt(rangeAbs, { sign: true, decimals: 2 })} sur{' '}
                {range === 'MAX' ? 'Max' : range}
              </>
            )}
          </span>
        </div>
      </div>

      <div className="range-tabs">
        {ranges.map((r) => (
          <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
            {r === 'MAX' ? 'Max' : r}
          </button>
        ))}
      </div>

      <div className="chart-toolbar">
        <ChartTypeToggle value={tweaks.chartStyle} onChange={(v) => setTweak('chartStyle', v)} />
      </div>

      <div className="big-chart-wrap">
        {candlesLoading ? (
          <LoadingRows count={1} height={200} />
        ) : (
          <>
            <BigChart
              points={points}
              style={tweaks.chartStyle}
              height={220}
              animated
              range={range}
              currency={currency}
              prevClose={
                range === '1D' ? (candles?.previousClose ?? quote?.previousClose ?? null) : null
              }
              session={candles?.session ?? null}
              timezone={candles?.timezone ?? null}
            />
            <div style={{ textAlign: 'center', marginTop: 4, fontSize: 12, color: 'var(--ink-3)' }}>
              {rangeChange != null && (
                <>
                  <span
                    style={{
                      color: rangeChange >= 0 ? 'var(--pos)' : 'var(--neg)',
                      fontWeight: 500,
                    }}
                  >
                    {pct(rangeChange)}
                  </span>{' '}
                  sur {range === 'MAX' ? 'Max' : range}
                </>
              )}
            </div>
            <SourceLine source={candles?.source} prefix="Données" />
          </>
        )}
      </div>

      {/* Ratios réels (Finnhub fundamentals) */}
      <div className="section-head">
        <div className="title">Ratios clés</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          {meta?.sector ?? ''}
        </span>
      </div>
      {ratios ? (
        <>
          <div className="ratio-grid">
            <RatioCell
              label="P/E"
              value={ratios.pe}
              hint="Price / Earnings"
              onInfo={() => setRatioInfo('pe')}
            />
            <RatioCell
              label="PEG"
              value={ratios.peg}
              hint="P/E ajusté croissance"
              onInfo={() => setRatioInfo('peg')}
            />
            <RatioCell
              label="EPS"
              value={ratios.eps}
              hint={`Bénéfice / action (${currency})`}
              onInfo={() => setRatioInfo('eps')}
            />
            <RatioCell
              label="Dividende"
              value={ratios.divYield != null ? `${ratios.divYield.toFixed(2)}%` : null}
              hint="Rendement"
              onInfo={() => setRatioInfo('divYield')}
            />
            <RatioCell
              label="Beta"
              value={ratios.beta}
              hint="Volatilité vs marché"
              onInfo={() => setRatioInfo('beta')}
            />
            <RatioCell
              label="Capitalisation"
              small
              value={
                marketCapFmt(ratios.marketCap)
                  ? marketCapFmt(ratios.marketCap) + (currency === 'USD' ? ' $' : ' €')
                  : null
              }
              hint="Market cap"
              onInfo={() => setRatioInfo('marketCap')}
            />
            <RatioCell
              label="Plus haut 52s"
              small
              value={ratios.high52 != null ? fmt(ratios.high52, { decimals: 2 }) : null}
              hint="Année glissante"
              onInfo={() => setRatioInfo('high52')}
            />
            <RatioCell
              label="Plus bas 52s"
              small
              value={ratios.low52 != null ? fmt(ratios.low52, { decimals: 2 }) : null}
              hint="Année glissante"
              onInfo={() => setRatioInfo('low52')}
            />
          </div>
          <SourceLine source={ratios.source} />
        </>
      ) : (
        <DataUnavailable message={profile?.message ?? 'Ratios en cours de chargement…'} />
      )}

      {/* Prochain earnings — calendrier officiel */}
      {nextEarning && (
        <>
          <div className="section-head">
            <div className="title">Prochain earnings</div>
            <button
              className="action"
              onClick={() => nav('earnings', { id: nextEarning.id, ticker: nextEarning.ticker })}
            >
              Détails
            </button>
          </div>
          <button
            className="earning-row"
            style={{ margin: '0 20px' }}
            onClick={() => nav('earnings', { id: nextEarning.id, ticker: nextEarning.ticker })}
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
              <Icon name="cal" size={20} />
            </div>
            <div className="info">
              <div className="tk">
                {frDate(nextEarning.date, { day: '2-digit', month: 'long' })}
              </div>
              <div className="nm">
                {nextEarning.quarter} ·{' '}
                {nextEarning.when === 'Before open'
                  ? 'Pré-ouverture'
                  : nextEarning.when === 'After close'
                    ? 'Après clôture'
                    : 'Horaire à confirmer'}
              </div>
            </div>
            <div className="pred">
              <div>Historique beats</div>
              <div className={'conf ' + ((beatStats?.beatRatePct ?? 50) >= 50 ? 'beat' : 'miss')}>
                {beatStats?.beatRatePct != null
                  ? `${beatStats.beats}/${beatStats.quarters} · ${beatStats.beatRatePct}%`
                  : '—'}
              </div>
            </div>
          </button>
        </>
      )}

      {/* Résumé IA des actualités impactantes */}
      <div className="section-head">
        <div className="title">Analyse IA des actualités</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          {aiStatus?.available ? 'Sources citées' : 'Clé API requise'}
        </span>
      </div>
      {!digestWanted ? (
        <div style={{ padding: '0 20px' }}>
          <button
            className="cta accent"
            disabled={!aiStatus?.available}
            onClick={() => setDigestWanted(true)}
          >
            <Icon name="wand" size={16} color="#fff" />
            {aiStatus?.available
              ? 'Résumer les infos qui peuvent impacter le cours'
              : 'IA indisponible — ajoutez ANTHROPIC_API_KEY'}
          </button>
        </div>
      ) : digest.isLoading ? (
        <div className="ai-report-card loading">
          <div className="ai-report-skel" style={{ width: '80%' }} />
          <div className="ai-report-skel" style={{ width: '95%' }} />
          <div className="ai-report-skel" style={{ width: '60%' }} />
        </div>
      ) : digest.isError ? (
        <DataUnavailable message="L'analyse IA a échoué (clé API, quota ou données insuffisantes)." />
      ) : digest.data ? (
        <div className="ai-report-card">
          <div className="ai-report-badge">
            <Icon name="wand" size={12} /> Généré par {digest.data.model}
          </div>
          <p className="ai-report-summary">{digest.data.overview}</p>
          <ul className="ai-report-points">
            {digest.data.items.map((it, i) => (
              <li key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={'ai-digest-impact ' + it.potentialImpact}>
                    {it.potentialImpact}
                  </span>
                  <strong style={{ fontSize: 12.5 }}>{it.headline}</strong>
                </div>
                <div style={{ marginTop: 3 }}>{it.whyItMatters}</div>
                <a
                  href={it.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--accent)' }}
                >
                  Source : {it.source} ↗
                </a>
              </li>
            ))}
          </ul>
          {digest.data.outlook && digest.data.outlook.horizons.length > 0 && (
            <div className="ai-outlook">
              <div className="ai-outlook-title">
                Perspectives d'évolution (selon les sources citées)
              </div>
              {digest.data.outlook.horizons.map((h) => (
                <div className="ai-outlook-row" key={h.horizon}>
                  <span className="ai-outlook-h">{h.horizon}</span>
                  <span>{h.scenario}</span>
                </div>
              ))}
              <div className="ai-outlook-caveat">{digest.data.outlook.caveat}</div>
            </div>
          )}
          <div className="ai-report-disclaimer">
            {digest.data.dataQuality} · Analyse générée à partir de sources réelles citées — pas un
            conseil en investissement.
          </div>
        </div>
      ) : null}

      {/* Actualités réelles avec liens directs */}
      <div className="section-head">
        <div className="title">Actualités récentes</div>
      </div>
      {newsLoading ? (
        <LoadingRows count={3} />
      ) : news && !news.available ? (
        <DataUnavailable message={news.message} />
      ) : (
        <div style={{ margin: '0 0 12px' }}>
          {(news?.items ?? []).slice(0, 6).map((n) => (
            <button
              className="news-card"
              key={n.id}
              onClick={() => window.open(n.url, '_blank', 'noopener')}
            >
              <div className="thumb">
                {n.imageUrl ? (
                  <img
                    src={n.imageUrl}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: 'inherit',
                    }}
                  />
                ) : (
                  '◐'
                )}
              </div>
              <div className="body">
                <div className="src">{n.source}</div>
                <h4>{n.headline}</h4>
                <div className="time">
                  il y a {timeAgo(n.publishedAt)} · lien direct vers l'article
                </div>
              </div>
              <Icon name="arrow-ne" size={13} color="var(--ink-4)" />
            </button>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="simulate-cta">
        <button className="secondary" onClick={() => toggleWatch.mutate(ticker)}>
          <Icon name={isWatched ? 'check' : 'star'} size={16} />
          {isWatched ? 'Suivi' : 'Suivre'}
        </button>
        <button className="primary" onClick={() => nav('simulator', { ticker })}>
          <Icon name="sim" size={16} color="var(--bg)" />
          Simuler
        </button>
      </div>

      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={cleanTicker(ticker)}
        items={[
          { icon: 'bell', label: 'Créer une alerte de prix', onClick: () => setAlertOpen(true) },
          {
            icon: 'arrow-ne',
            label: 'Ouvrir la source des données',
            onClick: () => quote && window.open(quote.source.url, '_blank', 'noopener'),
          },
        ]}
      />

      <AlertCreateSheet
        open={alertOpen}
        stock={displayStock}
        onClose={() => setAlertOpen(false)}
        onCreate={(a) => addAlert.mutate(a)}
      />

      <ActionSheet
        open={!!ratioInfo}
        onClose={() => setRatioInfo(null)}
        title={ratioInfo ? RATIO_INFO[ratioInfo]!.label : ''}
        description={
          ratioInfo ? (
            <>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  background: 'var(--surface-2)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  marginBottom: 8,
                  color: 'var(--ink-1)',
                }}
              >
                {RATIO_INFO[ratioInfo]!.formula}
              </div>
              {RATIO_INFO[ratioInfo]!.meaning}
            </>
          ) : (
            ''
          )
        }
        items={[]}
      />
    </div>
  );
}
