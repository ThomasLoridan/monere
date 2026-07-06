import React from 'react';

export interface Tweaks {
  dark: boolean;
  accent: string;
  chartStyle: 'line' | 'area' | 'candle';
  density: 'cosy' | 'compact';
  animateNums: boolean;
}

const DEFAULTS: Tweaks = {
  dark: true,
  accent: '#6366F1',
  chartStyle: 'area',
  density: 'cosy',
  animateNums: true,
};

export const ACCENT_OPTIONS = ['#6366F1', '#22D3EE', '#F472B6', '#84CC16'];

const KEY = 'monere_tweaks';

interface TweaksState {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
}

const TweaksContext = React.createContext<TweaksState | null>(null);

export function TweaksProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaks] = React.useState<Tweaks>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Tweaks>) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  const setTweak = React.useCallback(<K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
    setTweaks((t) => {
      const next = { ...t, [key]: value };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  // Apply theme + accent + density to the document root (same data-attrs as the design)
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.dark = String(tweaks.dark);
    root.dataset.card = 'glass';
    root.dataset.density = tweaks.density;
    root.dataset.sidebar = 'labels';
    root.style.setProperty('--accent', tweaks.accent);
    root.style.setProperty('--accent-soft', tweaks.accent + '1A');
    root.style.setProperty('--accent-tint', tweaks.accent + '0A');
  }, [tweaks]);

  const value = React.useMemo(() => ({ tweaks, setTweak }), [tweaks, setTweak]);
  return <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>;
}

export function useTweaks(): TweaksState {
  const ctx = React.useContext(TweaksContext);
  if (!ctx) throw new Error('useTweaks outside TweaksProvider');
  return ctx;
}
