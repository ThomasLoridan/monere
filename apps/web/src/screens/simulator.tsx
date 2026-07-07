/* SIMULATOR — parameters + mechanics computed from REAL historical earnings
   volatility, and an LLM analysis grounded in sourced data (ai service). */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, ActionSheet, SourceLine } from '../components/ui';
import { useQuote, useCompanyEarnings, useSimulatorInsight, useAiStatus } from '../data/hooks';
import { useStockMeta } from '../data/display';
import { fmt, pct, cleanTicker, frDate } from '../lib/format';
import type { ScreenProps } from '../state/nav';

export function SimulatorScreen({ nav, params }: ScreenProps) {
  const ticker = (params.ticker ?? '').toUpperCase();
  const meta = useStockMeta(ticker);
  const { data: quoteData } = useQuote(ticker);
  const { data: earnings } = useCompanyEarnings(meta?.finnhub ?? ticker);
  const { data: aiStatus } = useAiStatus();
  const insight = useSimulatorInsight();
  const [infoOpen, setInfoOpen] = React.useState(false);

  const [mode, setMode] = React.useState<'spot' | 'leverage'>('spot');
  const [direction, setDirection] = React.useState<'long' | 'short'>('long');
  const [amount, setAmount] = React.useState(1000);
  const [leverage, setLeverage] = React.useState(3);
  const [holding, setHolding] = React.useState(5);
  const [scenario, setScenario] = React.useState<'bear' | 'expected' | 'bull'>('expected');

  const quote = quoteData?.quote;
  const price = quote?.price ?? null;
  const currency = quote?.currency ?? meta?.currency ?? 'USD';

  const relatedEarning = earnings?.available
    ? params.around
      ? [...earnings.upcoming, ...earnings.past].find((e) => e.id === params.around)
      : earnings.upcoming[0]
    : undefined;

  // Base move = REAL average absolute 2-day earnings impact; fallback 2%
  const impacts = (earnings?.available ? earnings.past : [])
    .map((e) => e.priceImpact?.d2Pct)
    .filter((v): v is number => v != null);
  const baseMove = impacts.length
    ? impacts.reduce((a, b) => a + Math.abs(b), 0) / impacts.length
    : 2;
  const stats = earnings?.available ? earnings.history?.stats : undefined;
  const dirSign = stats?.tendency === 'miss' ? -1 : 1; // real historical tendency

  const scenarioMult = { bear: -1, expected: 1, bull: 1.8 }[scenario];
  const expectedReturnPct = baseMove * dirSign * scenarioMult * (direction === 'long' ? 1 : -1);
  const effectiveLeverage = mode === 'leverage' ? leverage : 1;
  const pnl = amount * (expectedReturnPct / 100) * effectiveLeverage;
  const exitPrice = price != null ? price * (1 + expectedReturnPct / 100) : null;
  const marginRisk =
    mode === 'leverage'
      ? Math.min(100, Math.max(0, (effectiveLeverage - 1) * 12 + Math.abs(baseMove) * 4))
      : 0;

  const scenarios: Array<'bear' | 'expected' | 'bull'> = ['bear', 'expected', 'bull'];

  const generate = () => {
    insight.mutate({
      ticker: meta?.finnhub ?? ticker,
      name: meta?.name ?? null,
      amount,
      leverage: effectiveLeverage,
      horizonDays: holding,
      direction,
    });
  };

  return (
    <div className="screen">
      <AppBar
        left={
          <button
            className="iconbtn"
            onClick={() =>
              params.around
                ? nav('earnings', { id: params.around, ticker })
                : nav('stock', { ticker })
            }
          >
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={() => setInfoOpen(true)}>
            <Icon name="info" size={18} />
          </button>
        }
      />

      <div className="page-head">
        <div className="eyebrow">Simulation · {cleanTicker(ticker)}</div>
        <h1>
          Stratégie
          <br />
          <em>d'investissement</em>.
        </h1>
        <p className="sub">
          {relatedEarning && relatedEarning.status === 'upcoming'
            ? `Avant les earnings du ${frDate(relatedEarning.date, { day: '2-digit', month: 'long' })}.`
            : 'Sans contexte earnings spécifique.'}
        </p>
      </div>

      <div className="sim-tabs">
        <button className={mode === 'spot' ? 'active' : ''} onClick={() => setMode('spot')}>
          Cours de l'action
        </button>
        <button className={mode === 'leverage' ? 'active' : ''} onClick={() => setMode('leverage')}>
          Avec levier
        </button>
      </div>

      <div className="sim-tabs">
        <button
          className={direction === 'long' ? 'active' : ''}
          onClick={() => setDirection('long')}
        >
          ▲ Long (achat)
        </button>
        <button
          className={direction === 'short' ? 'active' : ''}
          onClick={() => setDirection('short')}
        >
          ▼ Short (vente)
        </button>
      </div>

      <div className="sim-card">
        <div className="sim-row">
          <span className="l">Montant investi</span>
          <span className="r">{amount.toLocaleString('fr-FR')}&nbsp;€</span>
        </div>
        <input
          type="range"
          className="slider"
          min="100"
          max="20000"
          step="100"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />

        {mode === 'leverage' && (
          <>
            <div className="sim-row">
              <span className="l">Effet de levier</span>
              <span className="r">×{leverage}</span>
            </div>
            <input
              type="range"
              className="slider"
              min="1"
              max="20"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
            />
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: -4,
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Conservateur</span>
              <span style={{ color: marginRisk > 50 ? 'var(--neg)' : 'var(--ink-3)' }}>
                Risque margin call · {marginRisk.toFixed(0)}%
              </span>
            </div>
          </>
        )}

        <div className="sim-row">
          <span className="l">Horizon (jours)</span>
          <span className="r">{holding}j</span>
        </div>
        <input
          type="range"
          className="slider"
          min="1"
          max="30"
          step="1"
          value={holding}
          onChange={(e) => setHolding(Number(e.target.value))}
        />
      </div>

      <div className="sim-result">
        <div className="lbl">
          Résultat estimé (scénario{' '}
          {scenario === 'bear' ? 'pessimiste' : scenario === 'expected' ? 'central' : 'optimiste'})
        </div>
        <div className={'v ' + (pnl >= 0 ? 'pos' : 'neg')}>
          {pnl >= 0 ? '+' : ''}
          {pnl.toFixed(0)}&nbsp;€
        </div>
        <div className="sub">
          {pct(expectedReturnPct * effectiveLeverage)} sur {holding}j
          {exitPrice != null
            ? ` · sortie estimée ${fmt(exitPrice, { decimals: 2 })} ${currency}`
            : ''}
        </div>
      </div>

      <div className="section-head">
        <div className="title">3 scénarios</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          Volatilité earnings réelle : ±{baseMove.toFixed(1)}%
        </span>
      </div>
      <div className="scenario-bar">
        {scenarios.map((sc) => {
          const m = { bear: -1, expected: 1, bull: 1.8 }[sc];
          const ret = baseMove * dirSign * m * (direction === 'long' ? 1 : -1);
          const profit = amount * (ret / 100) * effectiveLeverage;
          const label = sc === 'bear' ? 'Pessimiste' : sc === 'expected' ? 'Attendu' : 'Optimiste';
          return (
            <button
              key={sc}
              onClick={() => setScenario(sc)}
              style={{
                flex: 1,
                padding: '12px 6px',
                textAlign: 'center',
                border: 'none',
                background: scenario === sc ? 'var(--surface)' : 'transparent',
                borderRight: sc !== 'bull' ? '1px solid var(--border)' : 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div className="lbl">{label}</div>
              <div className={'v ' + (profit >= 0 ? 'pos' : 'neg')}>
                {profit >= 0 ? '+' : ''}
                {profit.toFixed(0)}€
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, fontWeight: 500 }}>
                {pct(ret * effectiveLeverage)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Analyse IA fondée sur données réelles sourcées */}
      <div className="section-head">
        <div className="title">Expliquer la stratégie (IA)</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          {aiStatus?.available ? 'Sources réelles' : 'Clé API requise'}
        </span>
      </div>
      <div className="ai-prompt-card">
        <div
          style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, padding: '2px 2px 6px' }}
        >
          L'IA analysera cette configuration avec la cotation actuelle, le calendrier d'earnings
          officiel, l'historique battre/manquer et les actualités récentes — en citant chaque
          source.
        </div>
        <button
          className="cta accent"
          style={{ marginTop: 6 }}
          onClick={generate}
          disabled={insight.isPending || !aiStatus?.available}
        >
          <Icon name="wand" size={16} color="#fff" />
          {insight.isPending
            ? 'Génération…'
            : aiStatus?.available
              ? 'Générer le compte-rendu (IA)'
              : 'IA indisponible — ANTHROPIC_API_KEY manquante'}
        </button>
      </div>

      {insight.isPending && (
        <div className="ai-report-card loading">
          <div className="ai-report-skel" style={{ width: '80%' }} />
          <div className="ai-report-skel" style={{ width: '95%' }} />
          <div className="ai-report-skel" style={{ width: '60%' }} />
        </div>
      )}
      {insight.isError && (
        <div className="ai-report-card">
          <div className="ai-report-disclaimer">
            L'analyse IA a échoué — vérifiez la clé API ou réessayez.
          </div>
        </div>
      )}
      {insight.data && (
        <div className="ai-report-card">
          <div className="ai-report-badge">
            <Icon name="wand" size={12} /> Généré par {insight.data.model}
          </div>
          <div className="ai-report-summary" style={{ whiteSpace: 'pre-wrap' }}>
            {insight.data.analysis}
          </div>
        </div>
      )}

      <div
        style={{
          margin: '20px 20px 0',
          padding: 14,
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-soft)',
          borderRadius: 14,
          fontSize: 12,
          color: 'var(--accent-ink)',
          lineHeight: 1.45,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Icon name="info" size={14} color="currentColor" />
          <div>
            Simulation pédagogique fondée sur la volatilité réelle des{' '}
            {impacts.length || 'derniers'} derniers earnings.
            {mode === 'leverage' &&
              " Les produits à effet de levier peuvent entraîner des pertes supérieures à l'investissement initial."}{' '}
            Ceci n'est pas un conseil en investissement.
          </div>
        </div>
      </div>

      <ActionSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Méthodologie"
        description="Les scénarios utilisent la variation moyenne réelle du cours sur la fenêtre J-1→J+1 des derniers earnings publiés (source : cours historiques Yahoo Finance via nos serveurs) et la tendance battre/manquer calculée sur les résultats officiels. Ils sont indicatifs et ne constituent pas un conseil en investissement."
        items={[]}
      />
    </div>
  );
}
