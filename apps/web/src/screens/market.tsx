/* MARKET DETAIL (index) — real index candles + core composition + full
   constituent list (real source, linked) */
import React from 'react';
import { Icon } from '../components/Icon';
import {
  AppBar,
  AnimatedNumber,
  ActionSheet,
  StockRow,
  ChartTypeToggle,
  SourceLine,
  DataUnavailable,
  LoadingRows,
  DelayedBadge,
} from '../components/ui';
import { BigChart } from '../components/charts';
import { useIndices, useCandles, useConstituents, useUniverse } from '../data/hooks';
import { useDisplayStocks } from '../data/display';
import { useTweaks } from '../state/tweaks';
import { pct, frDate } from '../lib/format';
import type { ScreenProps } from '../state/nav';

// Yahoo symbols of the headline indices (same map as the market service)
const INDEX_SYMBOLS: Record<string, string> = {
  sp500: '^GSPC',
  ndx: '^NDX',
  cac40: '^FCHI',
  dax: '^GDAXI',
  stoxx: '^STOXX50E',
  ftse: '^FTSE',
};

export function MarketDetailScreen({ nav, params }: ScreenProps) {
  const id = params.id ?? 'sp500';
  const { tweaks, setTweak } = useTweaks();
  const [range, setRange] = React.useState('1D');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const ranges = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

  const { data: indicesData } = useIndices();
  const idx = (indicesData?.indices ?? []).find((i) => i.id === id);
  const symbol = INDEX_SYMBOLS[id] ?? null;
  const { data: candles, isLoading: candlesLoading } = useCandles(symbol, range);
  const { stocks, loading: stocksLoading } = useDisplayStocks(id);
  const constituents = useConstituents(showAll ? id : null);

  const points = candles?.points ?? [];
  const closes = points.map((p) => p.c).filter((c): c is number => c != null);
  const rangeChange =
    closes.length > 1 ? ((closes[closes.length - 1]! - closes[0]!) / closes[0]!) * 100 : null;
  const totalChange = stocks.length
    ? stocks.reduce((a, s) => a + (s.changePct ?? 0), 0) / stocks.length
    : null;

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn" onClick={() => nav('home')}>
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={18} />
          </button>
        }
      />

      <div className="detail-hero">
        <div className="tk-row">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              flexShrink: 0,
              background: 'var(--ink-1)',
              color: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="globe" size={22} />
          </div>
          <div>
            <h2>
              {idx?.name ?? id}
              <DelayedBadge delayed={idx?.delayed} />
            </h2>
            <div className="sub-name">{idx?.flag ?? ''} · Indice</div>
          </div>
        </div>
        <div className="price-big">
          <span className="p num">
            {idx ? (
              <AnimatedNumber value={idx.value} decimals={2} enabled={tweaks.animateNums} />
            ) : (
              '—'
            )}
          </span>
          <span className="cur">pts</span>
        </div>
        <div className={'change-pill ' + ((idx?.pct ?? 0) >= 0 ? 'up' : 'down')}>
          <span className="dot" />
          <span className="num">{pct(idx?.pct ?? null)} aujourd'hui</span>
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
              currency=" pts"
              prevClose={range === '1D' ? (candles?.previousClose ?? null) : null}
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
                  sur {range}
                </>
              )}
            </div>
            <SourceLine source={candles?.source} prefix="Données" />
          </>
        )}
      </div>

      <div className="section-head">
        <div className="title">Valeurs suivies · {stocks.length}</div>
        <span
          className="action"
          style={{ color: (totalChange ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}
        >
          Moyenne {pct(totalChange)}
        </span>
      </div>
      {stocksLoading ? (
        <LoadingRows count={4} />
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

      {/* Composition complète (source réelle) */}
      <div className="section-head">
        <div className="title">Composition complète de l'indice</div>
        <button className="action" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Masquer' : 'Charger →'}
        </button>
      </div>
      {showAll &&
        (constituents.isLoading ? (
          <LoadingRows count={4} height={34} />
        ) : constituents.isError || !constituents.data ? (
          <DataUnavailable message="Composition indisponible auprès de nos sources — aucune liste inventée." />
        ) : (
          <>
            <div className="eps-grid">
              {constituents.data.constituents.map((c, i) => (
                <button
                  key={i}
                  className="analyst-row"
                  style={{
                    width: '100%',
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                  onClick={() => nav('stock', { ticker: c.symbol })}
                >
                  <span className="firm">{c.symbol}</span>
                  <span className="v" style={{ fontWeight: 400, fontSize: 12 }}>
                    {c.name}
                  </span>
                  <Icon name="chevron" size={12} color="var(--ink-4)" />
                </button>
              ))}
            </div>
            <SourceLine source={constituents.data.source} />
            <div style={{ padding: '2px 20px 8px', fontSize: 10.5, color: 'var(--ink-3)' }}>
              Liste à jour du {frDate(constituents.data.asOf)} ·{' '}
              {constituents.data.constituents.length} valeurs
            </div>
          </>
        ))}

      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={idx?.name ?? ''}
        items={[
          ...(idx
            ? [
                {
                  icon: 'arrow-ne',
                  label: 'Ouvrir la source des cotations',
                  onClick: () => window.open(idx.source.url, '_blank', 'noopener'),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
