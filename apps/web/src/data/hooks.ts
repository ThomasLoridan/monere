/**
 * Data hooks — React Query over the gateway APIs. Every figure displayed by
 * the app flows through here; nothing is invented client-side.
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import React from 'react';
import { get, post, patch, del, openQuoteStream } from '../lib/api';
import type {
  StockMeta,
  Quote,
  IndexQuote,
  CandlesResponse,
  Ratios,
  NewsItem,
  CalendarEvent,
  CompanyEarnings,
  CongressMemberSummary,
  InvestorSummary,
  InsiderActivity,
  PriceAlert,
  EarningsAlert,
  Notification,
  NewsDigest,
  SourceLink,
} from '../lib/types';

// ── Universe (reference metadata) ───────────────────────────
export function useUniverse() {
  return useQuery({
    queryKey: ['universe'],
    queryFn: () =>
      get<{
        indices: Array<{ id: string; name: string; flag: string; region: string }>;
        stocks: StockMeta[];
      }>('/market/universe'),
    staleTime: 3600_000,
  });
}

// ── Quotes ──────────────────────────────────────────────────
export function useQuotes(tickers: string[]) {
  const key = [...tickers].sort().join(',');
  return useQuery({
    queryKey: ['quotes', key],
    queryFn: () => get<{ quotes: Quote[] }>(`/market/quotes?symbols=${encodeURIComponent(key)}`),
    enabled: tickers.length > 0,
    refetchInterval: 20_000, // ≤30s freshness even without the SSE stream
    staleTime: 15_000,
  });
}

export function useQuote(ticker: string | null) {
  return useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => get<{ quote: Quote }>(`/market/quote/${ticker}`),
    enabled: Boolean(ticker),
    refetchInterval: 15_000,
  });
}

/** Live quote map — SSE stream layered over the polled baseline. */
export function useLiveQuotes(tickers: string[]): Map<string, Quote> {
  const { data } = useQuotes(tickers);
  const [live, setLive] = React.useState<Map<string, Quote>>(new Map());
  const key = [...tickers].sort().join(',');

  React.useEffect(() => {
    if (!tickers.length) return;
    const close = openQuoteStream(tickers, (raw) => {
      const q = raw as Quote;
      setLive((m) => {
        const next = new Map(m);
        const prev = next.get(q.ticker);
        // WS trade prints carry price only — merge over the last full quote
        next.set(q.ticker, prev ? { ...prev, ...stripNulls(q) } : q);
        return next;
      });
    });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return React.useMemo(() => {
    const m = new Map<string, Quote>();
    for (const q of data?.quotes ?? []) m.set(q.ticker, q);
    for (const [t, q] of live) {
      const base = m.get(t);
      m.set(t, base ? { ...base, ...stripNulls(q) } : q);
    }
    return m;
  }, [data, live]);
}

function stripNulls<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null)) as Partial<T>;
}

// ── Indices ─────────────────────────────────────────────────
export function useIndices() {
  return useQuery({
    queryKey: ['indices'],
    queryFn: () => get<{ indices: IndexQuote[]; unavailable: number }>('/market/indices'),
    refetchInterval: 25_000,
  });
}

// ── Candles ─────────────────────────────────────────────────
export function useCandles(ticker: string | null, range: string) {
  return useQuery({
    queryKey: ['candles', ticker, range],
    queryFn: () => get<CandlesResponse>(`/market/candles/${ticker}?range=${range}`),
    enabled: Boolean(ticker),
    refetchInterval: range === '1D' ? 30_000 : undefined,
    staleTime: range === '1D' ? 25_000 : 300_000,
  });
}

// ── Profile / ratios ────────────────────────────────────────
export function useProfile(ticker: string | null) {
  return useQuery({
    queryKey: ['profile', ticker],
    queryFn: () =>
      get<{
        ticker: string;
        meta: StockMeta | null;
        ratios: Ratios | null;
        message?: string;
        profile?: Record<string, unknown> | null;
      }>(`/market/profile/${ticker}`),
    enabled: Boolean(ticker),
    staleTime: 600_000,
  });
}

// ── Search ──────────────────────────────────────────────────
export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      get<{ results: Array<{ symbol: string; name: string; exchange: string; type: string }> }>(
        `/market/search?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.trim().length > 0,
    staleTime: 300_000,
  });
}

// ── Composition d'un indice ─────────────────────────────────
export function useConstituents(indexId: string | null) {
  return useQuery({
    queryKey: ['constituents', indexId],
    queryFn: () =>
      get<{
        indexId: string;
        constituents: Array<{ symbol: string; name: string }>;
        source: SourceLink;
        asOf: string;
      }>(`/market/indices/${indexId}/constituents`),
    enabled: Boolean(indexId),
    staleTime: 3600_000,
    retry: 1,
  });
}

// ── News ────────────────────────────────────────────────────
export function useCompanyNews(ticker: string | null) {
  return useQuery({
    queryKey: ['news', 'company', ticker],
    queryFn: () =>
      get<{ available: boolean; message?: string; items: NewsItem[] }>(`/news/company/${ticker}`),
    enabled: Boolean(ticker),
    refetchInterval: 60_000,
  });
}

export function useNewsFeed(symbols: string[]) {
  const key = symbols.slice(0, 12).join(',');
  return useQuery({
    queryKey: ['news', 'feed', key],
    queryFn: () =>
      get<{ available: boolean; message?: string; items: NewsItem[] }>(
        `/news/feed?symbols=${encodeURIComponent(key)}`,
      ),
    refetchInterval: 30_000, // near-real-time feed
  });
}

// ── Earnings ────────────────────────────────────────────────
export function useEarningsCalendar(symbols?: string[]) {
  const sym = symbols?.join(',');
  return useQuery({
    queryKey: ['earnings', 'calendar', sym ?? 'all'],
    queryFn: () =>
      get<{ available: boolean; message?: string; events: CalendarEvent[] }>(
        `/earnings/calendar${sym ? `?symbols=${encodeURIComponent(sym)}` : ''}`,
      ),
    staleTime: 900_000,
  });
}

export function useCompanyEarnings(ticker: string | null) {
  return useQuery({
    queryKey: ['earnings', 'company', ticker],
    queryFn: () => get<CompanyEarnings>(`/earnings/company/${ticker}`),
    enabled: Boolean(ticker),
    staleTime: 900_000,
  });
}

// ── Smart money ─────────────────────────────────────────────
export function useCongress(search = '') {
  return useQuery({
    queryKey: ['smart', 'congress', search],
    queryFn: () =>
      get<{
        total: number;
        members: CongressMemberSummary[];
        sources: SourceLink[];
        partial: boolean;
        note: string;
      }>(`/smart/congress?pageSize=40${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    staleTime: 1800_000,
  });
}

export function useCongressMember(id: string | null) {
  return useQuery({
    queryKey: ['smart', 'congress', 'member', id],
    queryFn: () =>
      get<{
        member: Omit<CongressMemberSummary, 'recentFilings'> & {
          filings: import('../lib/types').CongressFiling[];
        };
        sources: SourceLink[];
      }>(`/smart/congress/${id}`),
    enabled: Boolean(id),
    staleTime: 1800_000,
  });
}

export function useInvestors(kind: 'billionaires' | 'funds' | 'all' = 'all') {
  return useQuery({
    queryKey: ['smart', 'investors', kind],
    queryFn: () => get<{ investors: InvestorSummary[] }>(`/smart/investors?kind=${kind}`),
    staleTime: 3600_000,
  });
}

export function useInvestor(id: string | null) {
  return useQuery({
    queryKey: ['smart', 'investor', id],
    queryFn: () =>
      get<InvestorSummary & { filing: NonNullable<InvestorSummary['filing']> }>(
        `/smart/investors/${id}`,
      ),
    enabled: Boolean(id),
    staleTime: 3600_000,
  });
}

export function useInsiderCompanies() {
  return useQuery({
    queryKey: ['smart', 'insiders'],
    queryFn: () =>
      get<{ companies: Array<{ ticker: string; name: string; cik: string }> }>('/smart/insiders'),
    staleTime: 3600_000,
  });
}

export function useInsiderActivity(ticker: string | null) {
  return useQuery({
    queryKey: ['smart', 'insiders', ticker],
    queryFn: () => get<InsiderActivity>(`/smart/insiders/${ticker}`),
    enabled: Boolean(ticker),
    staleTime: 1800_000,
  });
}

export function useEuropeInfo() {
  return useQuery({
    queryKey: ['smart', 'europe'],
    queryFn: () =>
      get<{ available: boolean; title: string; explanation: string; sources: SourceLink[] }>(
        '/smart/europe',
      ),
    staleTime: Infinity,
  });
}

// ── User data (watchlist, alerts, following, notifications) ─
export function useWatchlist() {
  return useQuery({
    queryKey: ['me', 'watchlist'],
    queryFn: () => get<{ tickers: string[] }>('/me/watchlist'),
  });
}

export function useToggleWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticker: string) =>
      post<{ tickers: string[]; added: boolean }>('/me/watchlist/toggle', { ticker }),
    onSuccess: (data) => qc.setQueryData(['me', 'watchlist'], { tickers: data.tickers }),
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['me', 'alerts'],
    queryFn: () => get<{ alerts: PriceAlert[] }>('/me/alerts'),
  });
}

export function useAlertMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['me', 'alerts'] });
  const add = useMutation({
    mutationFn: (a: { ticker: string; direction: 'above' | 'below'; target: number }) =>
      post('/me/alerts', a),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      patch(`/me/alerts/${id}`, { active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/me/alerts/${id}`),
    onSuccess: invalidate,
  });
  return { add, toggle, remove };
}

// ── Earnings alerts (rappel e-mail 7 jours avant la publication) ─
export function useEarningsAlerts() {
  return useQuery({
    queryKey: ['me', 'earnings-alerts'],
    queryFn: () => get<{ alerts: EarningsAlert[] }>('/me/earnings-alerts'),
  });
}

export function useEarningsAlertMutations() {
  const qc = useQueryClient();
  const setAlerts = (data: { alerts: EarningsAlert[] }) =>
    qc.setQueryData(['me', 'earnings-alerts'], { alerts: data.alerts });
  const toggle = useMutation({
    mutationFn: (a: { ticker: string; eventDate: string; quarter?: string }) =>
      post<{ alerts: EarningsAlert[]; added: boolean }>('/me/earnings-alerts/toggle', a),
    onSuccess: setAlerts,
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/me/earnings-alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'earnings-alerts'] }),
  });
  return { toggle, remove };
}

export function useFollowing() {
  return useQuery({
    queryKey: ['me', 'following'],
    queryFn: () => get<{ following: Array<{ kind: string; id: string }> }>('/me/following'),
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: { kind: string; id: string }) =>
      post<{ following: Array<{ kind: string; id: string }> }>('/me/following/toggle', f),
    onSuccess: (data) => qc.setQueryData(['me', 'following'], { following: data.following }),
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => get<{ notifications: Notification[]; unread: number }>('/me/notifications'),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/me/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'notifications'] }),
  });
}

// ── IA ──────────────────────────────────────────────────────
export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => get<{ available: boolean; model: string; message: string | null }>('/ai/status'),
    staleTime: 600_000,
  });
}

export function useNewsDigest(ticker: string | null, name: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['ai', 'digest', ticker],
    queryFn: () => post<NewsDigest>('/ai/news-digest', { ticker, name }),
    enabled: Boolean(ticker) && enabled,
    staleTime: 600_000,
    retry: false,
  });
}

export function useSimulatorInsight() {
  return useMutation({
    mutationFn: (input: {
      ticker: string;
      name?: string | null;
      amount: number;
      leverage: number;
      horizonDays: number;
      direction: 'long' | 'short';
    }) =>
      post<{ analysis: string; generatedAt: string; model: string }>(
        '/ai/simulator-insight',
        input,
      ),
  });
}

// ── Gateway health (admin) ──────────────────────────────────
export function usePlatformHealth(enabled: boolean) {
  return useQuery({
    queryKey: ['health'],
    queryFn: () =>
      get<{
        gateway: string;
        services: Array<{ service: string; status: string; uptime: number }>;
        allHealthy: boolean;
      }>('/health'),
    enabled,
    refetchInterval: 15_000,
  });
}
