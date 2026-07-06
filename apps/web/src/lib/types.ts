// Shared API payload types (mirror of the backend services' responses)

export interface StockMeta {
  ticker: string;
  symbol: string;
  yahoo: string;
  finnhub: string;
  name: string;
  exchange: string;
  currency: string;
  domain: string;
  sector: string;
  indices: string[];
  realtime: boolean;
}

export interface Quote {
  ticker: string;
  symbol: string;
  name: string | null;
  currency: string | null;
  price: number;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  marketTime: number | null;
  delayed: boolean;
  provider: string;
  source: SourceLink;
  fetchedAt: number;
}

export interface SourceLink {
  name: string;
  url: string;
}

export interface IndexQuote {
  id: string;
  name: string;
  flag: string;
  region: 'US' | 'EU';
  value: number;
  pct: number | null;
  spark: number[];
  delayed: boolean;
  source: SourceLink;
  marketTime: number | null;
}

export interface CandlePoint {
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

export interface CandlesResponse {
  ticker: string;
  range: string;
  currency: string;
  price: number;
  previousClose: number | null;
  session: { start: number; end: number } | null;
  timezone: string | null;
  delayed: boolean;
  points: CandlePoint[];
  source: SourceLink;
}

export interface Ratios {
  pe: number | null;
  eps: number | null;
  beta: number | null;
  divYield: number | null;
  high52: number | null;
  low52: number | null;
  peg: number | null;
  avgVolume10d: number | null;
  marketCap: number | null;
  source: SourceLink;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: number;
  hoursAgo: number;
  breaking: boolean;
  ticker?: string;
  kind?: 'company' | 'market';
}

export interface CalendarEvent {
  id: string;
  ticker: string;
  date: string;
  when: 'Before open' | 'After close' | 'TBD';
  quarter: string;
  status: 'upcoming' | 'past';
  consensus: { eps: number | null; revenue: number | null };
  actual: { eps: number | null; revenue: number | null } | null;
  surprise: { eps: string | null; revenue: string | null } | null;
  source: SourceLink;
  ir?: SourceLink | null;
  priceImpact?: {
    date: string;
    d1Pct: number | null;
    d2Pct: number | null;
    source: SourceLink | null;
  };
}

export interface BeatStats {
  quarters: number;
  beats: number;
  misses: number;
  beatRatePct: number | null;
  avgSurprisePct: number | null;
  tendency: 'beat' | 'miss' | 'inline' | null;
}

export interface CompanyEarnings {
  available: boolean;
  message?: string;
  ticker?: string;
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
  history: { rows: SurpriseRow[]; stats: BeatStats; source: SourceLink } | null;
  ir: SourceLink | null;
}

export interface SurpriseRow {
  period: string;
  quarter: string;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
}

export interface CongressMemberSummary {
  id: string;
  name: string;
  chamber: string;
  district: string | null;
  filingCount: number;
  lastFiled: string | null;
  recentFilings: CongressFiling[];
  source: SourceLink;
}

/** Periodic Transaction Report (STOCK Act) — links to the official PDF,
 *  which contains the trade details (tickers, amounts, dates). */
export interface CongressFiling {
  type: 'PTR';
  filed: string;
  year: number;
  docId: string;
  disclosureUrl: string;
}

export interface InvestorSummary {
  id: string;
  name: string;
  firm: string;
  kind: 'billionaires' | 'funds';
  cik: string;
  note: string;
  grad: string;
  filing: Filing13F | null;
  error: string | null;
}

export interface Filing13F {
  filerName: string;
  reportDate: string;
  filed: string;
  totalValueUsd: number;
  positions: number;
  holdings: Array<{ issuer: string; cusip: string; valueUsd: number; shares: number; pct: number }>;
  source: SourceLink;
}

export interface InsiderActivity {
  company: string;
  insiders: Array<{
    owner: string;
    role: string;
    isTenBFivePlan: boolean;
    transactions: Array<{
      date: string;
      code: string;
      shares: number;
      price: number | null;
      acquired: boolean;
    }>;
    filed: string;
    url: string;
  }>;
  source: SourceLink;
}

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  premium: boolean;
  premiumSince: string | null;
  emailVerified: boolean;
  notifPrefs: Record<string, boolean>;
  createdAt: string;
}

export interface PriceAlert {
  id: string;
  ticker: string;
  direction: 'above' | 'below';
  target: number;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  category: 'earnings' | 'news' | 'price' | 'smart' | 'breaking';
  title: string;
  body: string;
  navScreen: string | null;
  navParams: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NewsDigest {
  overview: string;
  items: Array<{
    headline: string;
    whyItMatters: string;
    potentialImpact: 'positive' | 'negative' | 'incertain';
    source: string;
    sourceUrl: string;
  }>;
  dataQuality: string;
  generatedAt: string;
  model: string;
}
