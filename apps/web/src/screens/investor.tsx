/* INVESTOR DETAIL — congress member ledger (official disclosure links),
   13F portfolio (EDGAR), or insider Form 4 activity */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, StockLogo, LoadingRows, DataUnavailable, SourceLine } from '../components/ui';
import {
  useCongressMember,
  useInvestor,
  useInsiderActivity,
  useFollowing,
  useToggleFollow,
  useUniverse,
} from '../data/hooks';
import { daysAgo, cleanTicker, frDate } from '../lib/format';
import { gradFor, initialsOf } from './smart';
import type { ScreenProps } from '../state/nav';

function disclosureDelay(traded: string, filed: string): number {
  return Math.max(
    0,
    Math.round((new Date(filed).getTime() - new Date(traded).getTime()) / 86400000),
  );
}

export function InvestorDetailScreen({ nav, params }: ScreenProps) {
  const kind = params.kind ?? 'billionaires';
  const id = params.id ?? '';
  const { data: following } = useFollowing();
  const toggleFollow = useToggleFollow();
  const isFollowed = (following?.following ?? []).some((f) => f.id === id);

  const follow = () => toggleFollow.mutate({ kind: kind === 'hedgefunds' ? 'funds' : kind, id });

  return (
    <div className="screen">
      <AppBar
        left={
          <button className="iconbtn" onClick={() => nav('smart')}>
            <Icon name="back" size={18} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={follow}>
            <Icon
              name={isFollowed ? 'star-fill' : 'star'}
              size={18}
              color={isFollowed ? 'var(--accent)' : 'currentColor'}
            />
          </button>
        }
      />

      {kind === 'congress' ? (
        <CongressDetail id={id} nav={nav} isFollowed={isFollowed} onFollow={follow} />
      ) : kind === 'insiders' ? (
        <InsiderDetail ticker={id} nav={nav} isFollowed={isFollowed} onFollow={follow} />
      ) : (
        <FundDetail id={id} nav={nav} isFollowed={isFollowed} onFollow={follow} />
      )}
    </div>
  );
}

function FollowCta({
  nav,
  isFollowed,
  onFollow,
}: {
  nav: ScreenProps['nav'];
  isFollowed: boolean;
  onFollow: () => void;
}) {
  return (
    <div className="simulate-cta">
      <button className="secondary" onClick={() => nav('smart')}>
        Tous les portefeuilles
      </button>
      <button className="primary" onClick={onFollow}>
        <Icon name={isFollowed ? 'check' : 'bell'} size={16} color="var(--bg)" />
        {isFollowed ? 'Suivi' : 'Suivre les trades'}
      </button>
    </div>
  );
}

function CongressDetail({
  id,
  nav,
  isFollowed,
  onFollow,
}: {
  id: string;
  nav: ScreenProps['nav'];
  isFollowed: boolean;
  onFollow: () => void;
}) {
  const { data, isLoading, isError } = useCongressMember(id);
  if (isLoading) return <LoadingRows count={4} height={80} />;
  if (isError || !data)
    return <DataUnavailable message="Membre introuvable dans les déclarations récentes." />;
  const p = data.member;

  return (
    <>
      <div className="investor-hero">
        <div className="smart-av lg" style={{ background: gradFor(p.id) }}>
          {initialsOf(p.name)}
        </div>
        <h2 className="serif">{p.name}</h2>
        <div className="investor-role">
          {p.chamber}
          {p.district ? ` · ${p.district}` : ''}
        </div>

        <div className="investor-stats">
          <div className="inv-stat">
            <div className="v">{p.filingCount}</div>
            <div className="l">Déclarations (2 ans)</div>
          </div>
          <div className="inv-stat">
            <div className="v" style={{ fontSize: 14 }}>
              {p.lastFiled ? frDate(p.lastFiled) : '—'}
            </div>
            <div className="l">Dernier dépôt</div>
          </div>
        </div>
      </div>

      <div className="investor-note">
        <span className="serif-it" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          “
        </span>
        Periodic Transaction Reports déposés en vertu du STOCK Act. Le détail des transactions
        (tickers, montants, dates de négociation) figure dans le PDF officiel de chaque déclaration
        — source primaire liée ci-dessous.
      </div>

      <div className="section-head">
        <div className="title">Déclarations de transactions</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          PDF officiels
        </span>
      </div>
      <div className="ledger">
        {p.filings.map((f, i) => (
          <button
            key={i}
            className="ledger-row"
            style={{ cursor: 'pointer' }}
            onClick={() => window.open(f.disclosureUrl, '_blank', 'noopener')}
          >
            <div className="ledger-arrow">
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="doc" size={16} />
              </div>
            </div>
            <div className="ledger-main">
              <div className="ledger-top">
                <span className="ledger-tk">Periodic Transaction Report</span>
                <span className="mini-pill opt">STOCK Act</span>
              </div>
              <div className="ledger-meta">
                Déposé le {frDate(f.filed, { day: '2-digit', month: 'long', year: 'numeric' })} ·{' '}
                {daysAgo(f.filed)} · Doc {f.docId}
              </div>
            </div>
            <div className="ledger-amt">
              <div
                className="amt"
                style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                PDF <Icon name="arrow-ne" size={12} />
              </div>
            </div>
          </button>
        ))}
      </div>
      {data.sources[0] && <SourceLine source={data.sources[0]} />}
      <FollowCta nav={nav} isFollowed={isFollowed} onFollow={onFollow} />
    </>
  );
}

function valueFmt(usd: number): string {
  if (usd >= 1e9) return (usd / 1e9).toFixed(1).replace('.', ',') + ' Md$';
  if (usd >= 1e6) return (usd / 1e6).toFixed(0) + ' M$';
  return usd.toLocaleString('fr-FR') + ' $';
}

function FundDetail({
  id,
  nav,
  isFollowed,
  onFollow,
}: {
  id: string;
  nav: ScreenProps['nav'];
  isFollowed: boolean;
  onFollow: () => void;
}) {
  const { data, isLoading, isError } = useInvestor(id);
  if (isLoading) return <LoadingRows count={4} height={80} />;
  if (isError || !data)
    return <DataUnavailable message="Dépôt 13F momentanément indisponible sur EDGAR." />;

  const filing = data.filing;
  const maxPct = Math.max(...filing.holdings.map((h) => h.pct), 1);

  return (
    <>
      <div className="investor-hero">
        <div className="smart-av lg" style={{ background: data.grad }}>
          {initialsOf(data.name)}
        </div>
        <h2 className="serif">{data.name}</h2>
        <div className="investor-role">{data.firm}</div>

        <div className="investor-stats">
          <div className="inv-stat">
            <div className="v">{valueFmt(filing.totalValueUsd)}</div>
            <div className="l">Valeur 13F</div>
          </div>
          <div className="inv-stat">
            <div className="v">{filing.positions}</div>
            <div className="l">Lignes</div>
          </div>
          <div className="inv-stat">
            <div className="v" style={{ fontSize: 14 }}>
              {frDate(filing.reportDate)}
            </div>
            <div className="l">Trimestre déclaré</div>
          </div>
        </div>
      </div>

      <div className="investor-note">
        <span className="serif-it" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          “
        </span>
        {data.note} · Dépôt du{' '}
        {frDate(filing.filed, { day: '2-digit', month: 'long', year: 'numeric' })}.
      </div>

      <div className="section-head">
        <div className="title">Portefeuille · top {filing.holdings.length}</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          % du 13F
        </span>
      </div>
      <div className="ledger">
        {filing.holdings.map((h, i) => (
          <div key={i} className="holding-row" style={{ cursor: 'default' }}>
            <div className="holding-top">
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: 'var(--surface-2)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                }}
              >
                {h.issuer.slice(0, 3).toUpperCase()}
              </div>
              <div className="holding-id">
                <span className="holding-tk">{h.issuer}</span>
                <span className="holding-nm">
                  {valueFmt(h.valueUsd)} · {h.shares.toLocaleString('fr-FR')} titres
                </span>
              </div>
              <div className="holding-right">
                <span className="holding-pct serif-it">{h.pct.toFixed(1)}%</span>
              </div>
            </div>
            <div className="holding-bar">
              <div
                className="holding-fill"
                style={{ width: (h.pct / maxPct) * 100 + '%', background: data.grad }}
              />
            </div>
          </div>
        ))}
      </div>
      <SourceLine source={filing.source} />
      <FollowCta nav={nav} isFollowed={isFollowed} onFollow={onFollow} />
    </>
  );
}

const FORM4_CODES: Record<string, string> = {
  P: 'Achat',
  S: 'Vente',
  A: 'Attribution',
  M: 'Exercice option',
  G: 'Don',
  F: 'Retenue fiscale',
  D: 'Cession',
};

function InsiderDetail({
  ticker,
  nav,
  isFollowed,
  onFollow,
}: {
  ticker: string;
  nav: ScreenProps['nav'];
  isFollowed: boolean;
  onFollow: () => void;
}) {
  const { data, isLoading, isError } = useInsiderActivity(ticker);
  const { data: universe } = useUniverse();
  const meta = (universe?.stocks ?? []).find((s) => s.ticker === ticker.toUpperCase());

  if (isLoading) return <LoadingRows count={4} height={80} />;
  if (isError || !data)
    return <DataUnavailable message="Formulaires 4 momentanément indisponibles sur EDGAR." />;

  return (
    <>
      <div className="investor-hero">
        <StockLogo
          stock={{ ticker, domain: meta?.domain }}
          style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto' }}
        />
        <h2 className="serif">{data.company}</h2>
        <div className="investor-role">Transactions des dirigeants (Form 4)</div>

        <div className="investor-stats">
          <div className="inv-stat">
            <div className="v">{data.insiders.length}</div>
            <div className="l">Dépôts récents</div>
          </div>
          <div className="inv-stat">
            <div className="v" style={{ fontSize: 14 }}>
              {data.insiders[0] ? frDate(data.insiders[0].filed) : '—'}
            </div>
            <div className="l">Dernier dépôt</div>
          </div>
        </div>
      </div>

      <div className="section-head">
        <div className="title">Formulaires 4 récents</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          SEC EDGAR
        </span>
      </div>
      <div className="ledger">
        {data.insiders.map((ins, i) => (
          <div
            key={i}
            className="ledger-row"
            style={{ cursor: 'default', alignItems: 'flex-start' }}
          >
            <div className="ledger-arrow">
              <div
                className="smart-av"
                style={{
                  background: gradFor(ins.owner),
                  width: 34,
                  height: 34,
                  fontSize: 11,
                  borderRadius: 10,
                }}
              >
                {initialsOf(ins.owner)}
              </div>
            </div>
            <div className="ledger-main">
              <div className="ledger-top">
                <span className="ledger-tk">{ins.owner}</span>
                {ins.isTenBFivePlan && <span className="mini-pill opt">Plan 10b5-1</span>}
              </div>
              <div className="ledger-meta">
                {ins.role} · déposé le {frDate(ins.filed)}
              </div>
              {ins.transactions.slice(0, 3).map((t, j) => (
                <div key={j} className="ledger-meta" style={{ marginTop: 3 }}>
                  <span
                    className={'mini-pill ' + (t.acquired ? 'buy' : 'sell')}
                    style={{ marginRight: 6 }}
                  >
                    {FORM4_CODES[t.code] ?? t.code}
                  </span>
                  {t.shares.toLocaleString('fr-FR')} actions
                  {t.price ? ` à ${t.price.toFixed(2)}` : ''} · {frDate(t.date)}
                </div>
              ))}
              <a
                href={ins.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--accent)' }}
              >
                Dépôt officiel SEC ↗
              </a>
            </div>
          </div>
        ))}
      </div>
      <SourceLine source={data.source} />
      <div className="simulate-cta">
        <button className="secondary" onClick={() => nav('stock', { ticker })}>
          Voir la valeur
        </button>
        <button className="primary" onClick={onFollow}>
          <Icon name={isFollowed ? 'check' : 'bell'} size={16} color="var(--bg)" />
          {isFollowed ? 'Suivi' : 'Suivre'}
        </button>
      </div>
    </>
  );
}
