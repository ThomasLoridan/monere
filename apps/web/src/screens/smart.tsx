/* SMART MONEY hub — real STOCK Act filings, real 13F (EDGAR), real Form 4,
   plus the honest "Europe" tab (no trade data exists for EU officials). */
import React from 'react';
import { Icon } from '../components/Icon';
import { AppBar, StockLogo, LoadingRows, DataUnavailable, SourceLine } from '../components/ui';
import {
  useCongress,
  useInvestors,
  useInsiderCompanies,
  useEuropeInfo,
  useFollowing,
  useUniverse,
} from '../data/hooks';
import { daysAgo, cleanTicker, frDate } from '../lib/format';
import type { ScreenProps } from '../state/nav';
import type { CongressMemberSummary, InvestorSummary } from '../lib/types';

type Tab = 'congress' | 'billionaires' | 'hedgefunds' | 'insiders' | 'europe';

// Deterministic gradient per person (design used curated gradients)
const GRADS = [
  'linear-gradient(135deg,#1D4ED8,#3B82F6)',
  'linear-gradient(135deg,#B91C1C,#EF4444)',
  'linear-gradient(135deg,#0F3D2E,#15803D)',
  'linear-gradient(135deg,#3730A3,#6366F1)',
  'linear-gradient(135deg,#78350F,#B45309)',
  'linear-gradient(135deg,#155E75,#0891B2)',
  'linear-gradient(135deg,#5B21B6,#8B5CF6)',
  'linear-gradient(135deg,#7C2D12,#EA580C)',
];
export function gradFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GRADS[Math.abs(h) % GRADS.length]!;
}
export const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function SmartMoneyScreen({ nav }: ScreenProps) {
  const [tab, setTab] = React.useState<Tab>('congress');
  const { data: following } = useFollowing();
  const followedIds = (following?.following ?? []).map((f) => f.id);

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
        <div className="eyebrow">Suivi · 13F, STOCK Act & Form 4</div>
        <h1>
          Dans le sillage
          <br />
          du <em>smart money</em>.
        </h1>
        <p className="sub">
          Élus américains, superinvestors, fonds et dirigeants — depuis les dépôts officiels, avec
          lien vers chaque déclaration.
        </p>
      </div>

      <div className="filter-pills" style={{ marginTop: 16, paddingLeft: 20, paddingRight: 20 }}>
        <button
          className={tab === 'congress' ? 'active' : ''}
          onClick={() => setTab('congress')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="landmark" size={13} /> Congrès US
        </button>
        <button
          className={tab === 'billionaires' ? 'active' : ''}
          onClick={() => setTab('billionaires')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="crown" size={13} /> Milliardaires
        </button>
        <button
          className={tab === 'hedgefunds' ? 'active' : ''}
          onClick={() => setTab('hedgefunds')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="wallet" size={13} /> Fonds spéculatifs
        </button>
        <button
          className={tab === 'insiders' ? 'active' : ''}
          onClick={() => setTab('insiders')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="shield" size={13} /> Dirigeants
        </button>
        <button
          className={tab === 'europe' ? 'active' : ''}
          onClick={() => setTab('europe')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="globe" size={13} /> Europe
        </button>
      </div>

      {tab === 'congress' && <CongressList nav={nav} followedIds={followedIds} />}
      {tab === 'billionaires' && (
        <FundList kind="billionaires" nav={nav} followedIds={followedIds} title="Superinvestors" />
      )}
      {tab === 'hedgefunds' && (
        <FundList kind="funds" nav={nav} followedIds={followedIds} title="Fonds spéculatifs" />
      )}
      {tab === 'insiders' && <InsiderList nav={nav} />}
      {tab === 'europe' && <EuropeInfo />}

      <div
        style={{
          margin: '22px 20px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--ink-3)',
          lineHeight: 1.4,
        }}
      >
        <Icon name="shield" size={13} color="var(--ink-3)" />
        <span>
          {tab === 'billionaires' || tab === 'hedgefunds'
            ? 'Source : dépôts 13F-HR officiels auprès de la SEC (EDGAR), agrégés par émetteur.'
            : tab === 'insiders'
              ? 'Source : formulaires 4 déposés auprès de la SEC (délai légal : 2 jours ouvrés).'
              : tab === 'europe'
                ? 'Le Parlement européen ne publie pas de registre de transactions boursières.'
                : 'Source : déclarations officielles STOCK Act (Sénat & Chambre US), chaque transaction pointe vers le document officiel.'}
        </span>
      </div>
    </div>
  );
}

function CongressList({ nav, followedIds }: { nav: ScreenProps['nav']; followedIds: string[] }) {
  const [search, setSearch] = React.useState('');
  const { data, isLoading } = useCongress(search);

  return (
    <>
      <div className="search-bar-wrap" style={{ paddingTop: 8 }}>
        <div className="search-bar">
          <Icon name="search" size={16} color="var(--ink-3)" />
          <input
            placeholder="Rechercher un élu (ex. Pelosi)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="section-head">
        <div className="title">Élus avec déclarations · {data?.total ?? '…'}</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          Chambre · 2 ans
        </span>
      </div>
      {isLoading ? (
        <LoadingRows count={5} height={78} />
      ) : !data || data.members.length === 0 ? (
        <DataUnavailable message="L'index officiel des déclarations de la Chambre est momentanément indisponible." />
      ) : (
        <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.members.map((p) => {
            const last = p.recentFilings[0];
            const followed = followedIds.includes(p.id);
            return (
              <button
                key={p.id}
                className="smart-card"
                onClick={() => nav('investor', { kind: 'congress', id: p.id })}
              >
                <div className="smart-av" style={{ background: gradFor(p.id) }}>
                  {initialsOf(p.name)}
                </div>
                <div className="smart-body">
                  <div className="smart-name">
                    {p.name}
                    {followed && (
                      <Icon
                        name="star-fill"
                        size={11}
                        color="var(--accent)"
                        style={{ marginLeft: 6, verticalAlign: 'middle' }}
                      />
                    )}
                  </div>
                  <div className="smart-sub">
                    {p.chamber}
                    {p.district ? ` · ${p.district}` : ''}
                  </div>
                  {last && (
                    <div className="smart-last">
                      <span className="mini-pill buy">Transactions déclarées</span>
                      <span className="smart-last-meta">· {daysAgo(last.filed)}</span>
                    </div>
                  )}
                </div>
                <div className="smart-stat">
                  <div className="smart-stat-v">{p.filingCount}</div>
                  <div className="smart-stat-l">déclarations</div>
                  <Icon name="chevron" size={14} color="var(--ink-4)" />
                </div>
              </button>
            );
          })}
        </div>
      )}
      {data?.note && (
        <div
          style={{
            margin: '14px 20px 0',
            fontSize: 11,
            color: 'var(--ink-3)',
            lineHeight: 1.5,
          }}
        >
          {data.note}
        </div>
      )}
      {data?.sources[0] && <SourceLine source={data.sources[0]} />}
      {data?.sources[1] && <SourceLine source={data.sources[1]} prefix="Sénat" />}
    </>
  );
}

function valueFmt(usd: number): string {
  if (usd >= 1e9) return (usd / 1e9).toFixed(1).replace('.', ',') + ' Md$';
  if (usd >= 1e6) return (usd / 1e6).toFixed(0) + ' M$';
  return usd.toLocaleString('fr-FR') + ' $';
}

function FundList({
  kind,
  nav,
  followedIds,
  title,
}: {
  kind: 'billionaires' | 'funds';
  nav: ScreenProps['nav'];
  followedIds: string[];
  title: string;
}) {
  const { data, isLoading } = useInvestors(kind);
  const investors = data?.investors ?? [];

  return (
    <>
      <div className="section-head">
        <div className="title">
          {title} · {investors.length}
        </div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          Dernier 13F
        </span>
      </div>
      {isLoading ? (
        <LoadingRows count={4} height={78} />
      ) : (
        <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {investors.map((p) => {
            const followed = followedIds.includes(p.id);
            return (
              <button
                key={p.id}
                className="smart-card"
                onClick={() => nav('investor', { kind, id: p.id })}
              >
                <div className="smart-av" style={{ background: p.grad }}>
                  {initialsOf(p.name)}
                </div>
                <div className="smart-body">
                  <div className="smart-name">
                    {p.name}
                    {followed && (
                      <Icon
                        name="star-fill"
                        size={11}
                        color="var(--accent)"
                        style={{ marginLeft: 6, verticalAlign: 'middle' }}
                      />
                    )}
                  </div>
                  <div className="smart-sub">{p.firm}</div>
                  <div className="smart-last">
                    {p.filing ? (
                      p.filing.holdings.slice(0, 3).map((h, i) => (
                        <span
                          key={i}
                          className="smart-last-tk"
                          style={{ marginRight: 8, color: 'var(--ink-2)' }}
                        >
                          {h.issuer.split(' ')[0]}{' '}
                          <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>
                            {h.pct.toFixed(0)}%
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="smart-last-meta">{p.error ?? 'Chargement du 13F…'}</span>
                    )}
                  </div>
                </div>
                <div className="smart-stat">
                  <div className="smart-stat-v" style={{ fontSize: 15 }}>
                    {p.filing ? valueFmt(p.filing.totalValueUsd) : '—'}
                  </div>
                  <div className="smart-stat-l">
                    {p.filing ? `${p.filing.positions} lignes` : ''}
                  </div>
                  <Icon name="chevron" size={14} color="var(--ink-4)" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function InsiderList({ nav }: { nav: ScreenProps['nav'] }) {
  const { data, isLoading } = useInsiderCompanies();
  const { data: universe } = useUniverse();
  return (
    <>
      <div className="section-head">
        <div className="title">Sociétés suivies (Form 4) · {data?.companies.length ?? '…'}</div>
        <span className="action" style={{ color: 'var(--ink-3)' }}>
          SEC EDGAR
        </span>
      </div>
      {isLoading ? (
        <LoadingRows count={4} height={64} />
      ) : (
        <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(data?.companies ?? []).map((c) => {
            const meta = (universe?.stocks ?? []).find((s) => s.ticker === c.ticker);
            return (
              <button
                key={c.ticker}
                className="smart-card"
                onClick={() => nav('investor', { kind: 'insiders', id: c.ticker })}
              >
                <StockLogo
                  stock={{ ticker: c.ticker, domain: meta?.domain }}
                  style={{ width: 44, height: 44, borderRadius: 13 }}
                />
                <div className="smart-body">
                  <div className="smart-name">{c.name}</div>
                  <div className="smart-sub">Transactions des dirigeants et administrateurs</div>
                  <div className="smart-last">
                    <span className="smart-last-tk">{cleanTicker(c.ticker)}</span>
                    <span className="smart-last-meta">· CIK {c.cik}</span>
                  </div>
                </div>
                <div className="smart-stat">
                  <Icon name="chevron" size={14} color="var(--ink-4)" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function EuropeInfo() {
  const { data, isLoading } = useEuropeInfo();
  if (isLoading || !data) return <LoadingRows count={2} height={70} />;
  return (
    <div style={{ margin: '4px 16px 0' }}>
      <div className="investor-note" style={{ margin: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--ink-1)',
            marginBottom: 8,
          }}
        >
          {data.title}
        </div>
        {data.explanation}
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.sources.map((s, i) => (
          <a
            key={i}
            className="source-line"
            style={{ padding: 0 }}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="arrow-ne" size={11} /> {s.name}
          </a>
        ))}
      </div>
    </div>
  );
}
