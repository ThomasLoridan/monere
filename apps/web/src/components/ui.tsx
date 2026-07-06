/* UI primitives — ported from the design (ui.jsx), typed and wired to real data */
import React from 'react';
import { Icon } from './Icon';
import { Sparkline } from './charts';
import { fmt, pct, cleanTicker } from '../lib/format';

/** Minimal display shape shared by list rows (built from live quotes + metadata). */
export interface DisplayStock {
  ticker: string;
  name: string;
  domain?: string | null;
  price?: number | null;
  change?: number | null;
  changePct?: number | null;
  currency?: string | null;
  spark?: number[];
  delayed?: boolean;
  exchange?: string;
  sector?: string;
}

export function Wordmark({ size = 22 }: { size?: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        className="wordmark-btn"
        onClick={() => setOpen(true)}
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: size,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: 'var(--ink-1)',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        Monere<span style={{ color: 'var(--accent)' }}>.</span>
      </button>
      <NameOriginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NameOriginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="origin-modal">
        <button className="iconbtn ghost origin-close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <div className="origin-word">
          Monere<span style={{ color: 'var(--accent)' }}>.</span>
        </div>
        <div className="origin-eyebrow">Origine du nom</div>
        <p className="origin-text">
          En latin, <em>monumentum</em> dérive de <em>« monere »</em>, qui signifie « avertir », «
          rappeler ».
        </p>
        <p className="origin-text">
          Le terme français <em>monnaie</em> provient de ce que la monnaie romaine était frappée
          dans le temple de <em>Juno Moneta</em> (de <em>monere</em> : « l'avertisseuse »), au
          Capitole, et portait parfois cette épithète sous l'effigie de la déesse.
        </p>
      </div>
    </>
  );
}

export function PaywallModal({
  open,
  onClose,
  onSubscribe,
  onSeePlans,
}: {
  open: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  onSeePlans?: () => void;
}) {
  if (!open) return null;
  const features = [
    'Transcriptions complètes des earnings calls',
    'Analyses IA détaillées avec sources',
    'Alertes de prix illimitées',
    'Suivi smart money en temps réel',
  ];
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="origin-modal paywall-modal">
        <button className="iconbtn ghost origin-close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <div className="paywall-badge">Premium</div>
        <div className="origin-word" style={{ marginBottom: 6 }}>
          Monere<span style={{ color: 'var(--accent)' }}>.</span> Premium
        </div>
        <p className="origin-text" style={{ marginBottom: 18 }}>
          Débloque l'analyse complète des résultats et du smart money.
        </p>
        <ul className="paywall-features">
          {features.map((f, i) => (
            <li key={i}>
              <Icon name="check" size={14} color="var(--accent)" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <button className="cta accent" onClick={onSubscribe}>
          Commencer l'essai gratuit
        </button>
        <div className="paywall-price">
          9,99&nbsp;€/mois après 7 jours d'essai · sans engagement
        </div>
        {onSeePlans && (
          <button
            className="paywall-plans-link"
            onClick={() => {
              onClose();
              onSeePlans();
            }}
          >
            Voir tous les plans
          </button>
        )}
      </div>
    </>
  );
}

export function AnimatedNumber({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  sign = false,
  enabled = true,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  sign?: boolean;
  enabled?: boolean;
}) {
  const [display, setDisplay] = React.useState(value);
  const raf = React.useRef<number | null>(null);
  const displayRef = React.useRef(value);
  displayRef.current = display;
  React.useEffect(() => {
    if (!enabled) {
      setDisplay(value);
      return;
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    const start = displayRef.current;
    const t0 = performance.now();
    const dur = 320;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      setDisplay(start + (value - start) * ease);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled]);
  return <span>{fmt(display, { decimals, prefix, suffix, sign })}</span>;
}

export function TabBar({ current, onChange }: { current: string; onChange: (id: string) => void }) {
  const tabs = [
    { id: 'home', label: 'Marchés', icon: 'home' },
    { id: 'watch', label: 'Favoris', icon: 'star' },
    { id: 'calendar', label: 'Earnings', icon: 'cal' },
    { id: 'smart', label: 'Suivi', icon: 'users' },
    { id: 'settings', label: 'Réglages', icon: 'cog' },
  ];
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={'tab ' + (current === t.id ? 'active' : '')}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={22} strokeWidth={current === t.id ? 2 : 1.6} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function AppBar({
  left,
  right,
  transparent = false,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  transparent?: boolean;
}) {
  return (
    <div className="appbar" style={transparent ? { background: 'transparent' } : {}}>
      <div className="left">{left}</div>
      <div className="right">{right}</div>
    </div>
  );
}

/** Honest latency badge — shown on EU venues (delayed on the free data tier). */
export function DelayedBadge({ delayed }: { delayed?: boolean }) {
  if (!delayed) return null;
  return (
    <span className="delayed-badge" title="Données différées (~15 min) — plan de données gratuit">
      <Icon name="clock" size={9} /> différé
    </span>
  );
}

export function StockLogo({
  stock,
  className = '',
  style,
}: {
  stock: { ticker: string; domain?: string | null };
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = React.useState(false);
  const initials = cleanTicker(stock.ticker || '').slice(0, 2);
  const showImg = Boolean(stock.domain) && !failed;
  return (
    <div className={'stock-logo' + (className ? ' ' + className : '')} style={style}>
      {showImg && (
        <img
          className="stock-logo-img"
          src={`https://www.google.com/s2/favicons?domain=${stock.domain}&sz=128`}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
      <span className="stock-logo-fallback" style={{ opacity: showImg ? 0 : 1 }}>
        {initials}
      </span>
    </div>
  );
}

export function StockRow({
  stock,
  onClick,
  showSpark = true,
}: {
  stock: DisplayStock;
  onClick?: (s: DisplayStock) => void;
  showSpark?: boolean;
}) {
  const up = (stock.changePct ?? 0) >= 0;
  return (
    <button className="stock-row" onClick={() => onClick && onClick(stock)}>
      <StockLogo stock={stock} />
      <div className="stock-meta">
        <div className="tk">
          {cleanTicker(stock.ticker)}
          <DelayedBadge delayed={stock.delayed} />
        </div>
        <div className="nm">{stock.name}</div>
      </div>
      {showSpark && stock.spark && stock.spark.length > 1 && (
        <Sparkline series={stock.spark} color={up ? 'var(--pos)' : 'var(--neg)'} />
      )}
      <div className="stock-price">
        <div className="p num">{fmt(stock.price ?? null, { decimals: 2 })}</div>
        <div className={'d num ' + (up ? 'delta-up' : 'delta-down')}>
          {pct(stock.changePct ?? null)}
        </div>
      </div>
    </button>
  );
}

export interface DisplayIndex {
  id: string;
  name: string;
  flag: string;
  value: number;
  pct: number | null;
  delayed?: boolean;
}

export function IndexChip({
  idx,
  active,
  onClick,
  onOpenDetail,
}: {
  idx: DisplayIndex;
  active?: boolean;
  onClick?: (i: DisplayIndex) => void;
  onOpenDetail?: (i: DisplayIndex) => void;
}) {
  const up = (idx.pct ?? 0) >= 0;
  return (
    <button
      className={'idx-chip ' + (active ? 'active' : '')}
      onClick={() => onClick && onClick(idx)}
    >
      <div className="idx-chip-top">
        <div className="flag">{idx.flag}</div>
        {onOpenDetail && (
          <span
            className="idx-open"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(idx);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onOpenDetail(idx);
              }
            }}
          >
            <Icon name="arrow-ne" size={12} />
          </span>
        )}
      </div>
      <div className="name">{idx.name}</div>
      <div className="val num">
        {idx.value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className={'delta ' + (up ? 'delta-up' : 'delta-down')}>{pct(idx.pct)}</div>
    </button>
  );
}

export function SettingsSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="switch" data-on={on ? '1' : '0'} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export interface SheetItem {
  icon: string;
  label: string;
  onClick?: () => void;
}

export function ActionSheet({
  open,
  onClose,
  items = [],
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  items?: SheetItem[];
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        {title && <div className="sheet-title">{title}</div>}
        {description && <div className="sheet-desc">{description}</div>}
        {items.map((it, i) => (
          <button
            key={i}
            className="sheet-item"
            onClick={() => {
              it.onClick && it.onClick();
              onClose();
            }}
          >
            <Icon name={it.icon} size={18} />
            <span>{it.label}</span>
          </button>
        ))}
        <button className="sheet-item cancel" onClick={onClose}>
          {items.length ? 'Annuler' : 'Fermer'}
        </button>
      </div>
    </>
  );
}

export function AlertCreateSheet({
  open,
  onClose,
  stock,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  stock: DisplayStock | null;
  onCreate: (a: { ticker: string; direction: 'above' | 'below'; target: number }) => void;
}) {
  const [direction, setDirection] = React.useState<'above' | 'below'>('above');
  const [target, setTarget] = React.useState(0);

  React.useEffect(() => {
    if (open && stock?.price) {
      setDirection('above');
      setTarget(Math.round(stock.price * 1.05 * 100) / 100);
    }
  }, [open, stock?.ticker, stock?.price]);

  if (!open || !stock) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-title">Nouvelle alerte · {cleanTicker(stock.ticker)}</div>
        <div className="alert-form">
          <div className="alert-form-row">
            <span className="lbl">Cours actuel</span>
            <span className="val num">
              {fmt(stock.price ?? null, { decimals: 2 })} {stock.currency}
            </span>
          </div>
          <div className="alert-dir-toggle">
            <button
              className={direction === 'above' ? 'active' : ''}
              onClick={() => setDirection('above')}
            >
              <Icon name="arrow-up" size={13} /> Au-dessus de
            </button>
            <button
              className={direction === 'below' ? 'active' : ''}
              onClick={() => setDirection('below')}
            >
              <Icon name="arrow-dn" size={13} /> En dessous de
            </button>
          </div>
          <div className="alert-target-input">
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
            <span className="cur">{stock.currency}</span>
          </div>
        </div>

        <button
          className="sheet-item confirm"
          onClick={() => {
            if (target > 0) onCreate({ ticker: stock.ticker, direction, target });
            onClose();
          }}
        >
          Créer l'alerte
        </button>
        <button className="sheet-item cancel" onClick={onClose}>
          Annuler
        </button>
      </div>
    </>
  );
}

export const NOTIF_META: Record<string, { icon: string; grad: string }> = {
  earnings: { icon: 'cal', grad: 'linear-gradient(135deg,#6366F1,#818CF8)' },
  news: { icon: 'news', grad: 'linear-gradient(135deg,#3B82F6,#60A5FA)' },
  breaking: { icon: 'bolt', grad: 'linear-gradient(135deg,#EF4444,#FB923C)' },
  price: { icon: 'bell', grad: 'linear-gradient(135deg,#EF4444,#F87171)' },
  smart: { icon: 'users', grad: 'linear-gradient(135deg,#8B5CF6,#A78BFA)' },
};

export interface BannerNotif {
  category: string;
  title: string;
  body: string;
}

export function NotificationBanner({
  notif,
  onOpen,
  onDismiss,
}: {
  notif: BannerNotif | null;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const touchY = React.useRef<number | null>(null);
  if (!notif) return null;
  const meta = NOTIF_META[notif.category] || NOTIF_META.news!;
  return (
    <div className="notif-banner-wrap">
      <button
        className="notif-banner"
        onClick={onOpen}
        onTouchStart={(e) => {
          touchY.current = e.touches[0]!.clientY;
        }}
        onTouchMove={(e) => {
          if (touchY.current != null && e.touches[0]!.clientY - touchY.current < -16) onDismiss();
        }}
      >
        <div className="notif-banner-ic" style={{ background: meta.grad }}>
          <Icon name={meta.icon} size={15} color="#fff" />
        </div>
        <div className="notif-banner-body">
          <div className="notif-banner-top">
            <span className="notif-banner-app">Monere</span>
            <span className="notif-banner-time">maintenant</span>
          </div>
          <div className="notif-banner-title">{notif.title}</div>
          <div className="notif-banner-text">{notif.body}</div>
        </div>
      </button>
    </div>
  );
}

export function ChartTypeToggle({
  value,
  onChange,
  options = ['area', 'candle'],
}: {
  value: string;
  onChange: (v: 'line' | 'area' | 'candle') => void;
  options?: Array<'line' | 'area' | 'candle'>;
}) {
  const meta: Record<string, { icon: string; label: string }> = {
    line: { icon: 'c-line', label: 'Ligne' },
    area: { icon: 'c-area', label: 'Aire' },
    candle: { icon: 'c-candle', label: 'Bougies' },
  };
  const norm = value === 'line' && !options.includes('line') ? null : value;
  return (
    <div className="ctype-toggle" role="tablist">
      {options.map((o) => (
        <button
          key={o}
          role="tab"
          aria-selected={norm === o}
          className={'ctype-btn ' + (norm === o ? 'active' : '')}
          onClick={() => onChange(o)}
        >
          <Icon name={meta[o]!.icon} size={15} />
          <span>{meta[o]!.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Source attribution link — every real data block carries one. */
export function SourceLine({
  source,
  prefix = 'Source',
}: {
  source?: { name: string; url: string } | null;
  prefix?: string;
}) {
  if (!source) return null;
  return (
    <a className="source-line" href={source.url} target="_blank" rel="noopener noreferrer">
      <Icon name="shield" size={11} /> {prefix} : {source.name} <Icon name="arrow-ne" size={10} />
    </a>
  );
}

/** Uniform empty/unavailable state — shown instead of invented data. */
export function DataUnavailable({ message }: { message?: string }) {
  return (
    <div className="watchlist-empty" style={{ margin: '12px 20px' }}>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 20,
          color: 'var(--ink-2)',
          marginBottom: 6,
        }}
      >
        Données indisponibles
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        {message ??
          'La source de données n’a pas répondu — rien n’est affiché plutôt que des données inventées.'}
      </div>
    </div>
  );
}

export function LoadingRows({ count = 3, height = 56 }: { count?: number; height?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 20px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ai-report-skel"
          style={{ height, width: '100%', borderRadius: 14 }}
        />
      ))}
    </div>
  );
}
