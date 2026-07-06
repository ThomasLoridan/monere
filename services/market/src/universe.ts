/**
 * Static METADATA registry (names, domains, exchange mapping, Yahoo symbols).
 * This is reference data, not market data — prices, ratios and series always
 * come from live providers (Finnhub / Yahoo). Extend freely.
 */

export interface IndexDef {
  id: string;
  name: string;
  flag: string;
  region: 'US' | 'EU';
  yahoo: string; // Yahoo Finance symbol for real quotes/series
  /** Wikipedia page used as the free source of constituents (linked in the app). */
  constituentsSource?: { page: string; url: string };
  /** Finnhub index symbol (constituents = paid plan; used when available). */
  finnhub?: string;
}

export const INDEX_DEFS: IndexDef[] = [
  {
    id: 'sp500',
    name: 'S&P 500',
    flag: 'USA · INX',
    region: 'US',
    yahoo: '^GSPC',
    finnhub: '^GSPC',
    constituentsSource: {
      page: 'List_of_S%26P_500_companies',
      url: 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
    },
  },
  {
    id: 'ndx',
    name: 'Nasdaq 100',
    flag: 'USA · NDX',
    region: 'US',
    yahoo: '^NDX',
    finnhub: '^NDX',
    constituentsSource: { page: 'Nasdaq-100', url: 'https://en.wikipedia.org/wiki/Nasdaq-100' },
  },
  {
    id: 'cac40',
    name: 'CAC 40',
    flag: 'FR · PX1',
    region: 'EU',
    yahoo: '^FCHI',
    constituentsSource: { page: 'CAC_40', url: 'https://en.wikipedia.org/wiki/CAC_40' },
  },
  {
    id: 'dax',
    name: 'DAX',
    flag: 'DE · DAX',
    region: 'EU',
    yahoo: '^GDAXI',
    constituentsSource: { page: 'DAX', url: 'https://en.wikipedia.org/wiki/DAX' },
  },
  {
    id: 'stoxx',
    name: 'Euro Stoxx 50',
    flag: 'EU · SX5E',
    region: 'EU',
    yahoo: '^STOXX50E',
    constituentsSource: {
      page: 'EURO_STOXX_50',
      url: 'https://en.wikipedia.org/wiki/EURO_STOXX_50',
    },
  },
  {
    id: 'ftse',
    name: 'FTSE 100',
    flag: 'UK · UKX',
    region: 'EU',
    yahoo: '^FTSE',
    constituentsSource: {
      page: 'FTSE_100_Index',
      url: 'https://en.wikipedia.org/wiki/FTSE_100_Index',
    },
  },
];

export interface StockMeta {
  ticker: string; // canonical app id, e.g. "MC"
  symbol: string; // quoted symbol, e.g. "MC.PA"
  yahoo: string; // Yahoo symbol
  finnhub: string; // Finnhub symbol (US = plain; EU = exchange-suffixed)
  name: string;
  exchange: string;
  currency: 'USD' | 'EUR' | 'GBP';
  domain: string;
  sector: string;
  indices: string[];
  /** US symbols stream in real time on the Finnhub free tier; EU venues are delayed. */
  realtime: boolean;
}

const us = (
  ticker: string,
  name: string,
  domain: string,
  sector: string,
  indices: string[],
): StockMeta => ({
  ticker,
  symbol: ticker,
  yahoo: ticker,
  finnhub: ticker,
  name,
  exchange: 'NASDAQ',
  currency: 'USD',
  domain,
  sector,
  indices,
  realtime: true,
});

export const CORE_STOCKS: StockMeta[] = [
  us('AAPL', 'Apple Inc.', 'apple.com', 'Technology · Consumer Electronics', ['sp500', 'ndx']),
  us('MSFT', 'Microsoft Corp.', 'microsoft.com', 'Technology · Software', ['sp500', 'ndx']),
  us('NVDA', 'NVIDIA Corp.', 'nvidia.com', 'Technology · Semiconductors', ['sp500', 'ndx']),
  us('GOOGL', 'Alphabet Inc.', 'abc.xyz', 'Technology · Internet', ['sp500', 'ndx']),
  us('AMZN', 'Amazon.com Inc.', 'amazon.com', 'Consumer · E-commerce', ['sp500', 'ndx']),
  us('TSLA', 'Tesla Inc.', 'tesla.com', 'Consumer · Auto manufacturers', ['sp500', 'ndx']),
  us('META', 'Meta Platforms', 'meta.com', 'Technology · Social', ['sp500', 'ndx']),
  {
    ticker: 'MC',
    symbol: 'MC.PA',
    yahoo: 'MC.PA',
    finnhub: 'MC.PA',
    name: 'LVMH Moët Hennessy',
    exchange: 'Euronext Paris',
    currency: 'EUR',
    domain: 'lvmh.com',
    sector: 'Consumer · Luxury',
    indices: ['cac40', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'OR',
    symbol: 'OR.PA',
    yahoo: 'OR.PA',
    finnhub: 'OR.PA',
    name: "L'Oréal SA",
    exchange: 'Euronext Paris',
    currency: 'EUR',
    domain: 'loreal.com',
    sector: 'Consumer · Beauty',
    indices: ['cac40', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'AIR',
    symbol: 'AIR.PA',
    yahoo: 'AIR.PA',
    finnhub: 'AIR.PA',
    name: 'Airbus SE',
    exchange: 'Euronext Paris',
    currency: 'EUR',
    domain: 'airbus.com',
    sector: 'Industrials · Aerospace',
    indices: ['cac40', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'BNP',
    symbol: 'BNP.PA',
    yahoo: 'BNP.PA',
    finnhub: 'BNP.PA',
    name: 'BNP Paribas',
    exchange: 'Euronext Paris',
    currency: 'EUR',
    domain: 'bnpparibas.com',
    sector: 'Financials · Banking',
    indices: ['cac40', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'SAN',
    symbol: 'SAN.PA',
    yahoo: 'SAN.PA',
    finnhub: 'SAN.PA',
    name: 'Sanofi SA',
    exchange: 'Euronext Paris',
    currency: 'EUR',
    domain: 'sanofi.com',
    sector: 'Healthcare · Pharma',
    indices: ['cac40', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'SAP',
    symbol: 'SAP.DE',
    yahoo: 'SAP.DE',
    finnhub: 'SAP.DE',
    name: 'SAP SE',
    exchange: 'XETRA',
    currency: 'EUR',
    domain: 'sap.com',
    sector: 'Technology · Enterprise SaaS',
    indices: ['dax', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'SIE',
    symbol: 'SIE.DE',
    yahoo: 'SIE.DE',
    finnhub: 'SIE.DE',
    name: 'Siemens AG',
    exchange: 'XETRA',
    currency: 'EUR',
    domain: 'siemens.com',
    sector: 'Industrials · Conglomerate',
    indices: ['dax', 'stoxx'],
    realtime: false,
  },
  {
    ticker: 'ASML',
    symbol: 'ASML.AS',
    yahoo: 'ASML.AS',
    finnhub: 'ASML.AS',
    name: 'ASML Holding',
    exchange: 'Euronext Amsterdam',
    currency: 'EUR',
    domain: 'asml.com',
    sector: 'Technology · Semiconductors',
    indices: ['stoxx'],
    realtime: false,
  },
  {
    ticker: 'NVO',
    symbol: 'NVO',
    yahoo: 'NVO',
    finnhub: 'NVO',
    name: 'Novo Nordisk',
    exchange: 'NYSE',
    currency: 'USD',
    domain: 'novonordisk.com',
    sector: 'Healthcare · Pharma',
    indices: ['stoxx'],
    realtime: true,
  },
];

const byTicker = new Map(CORE_STOCKS.map((s) => [s.ticker, s]));
const bySymbol = new Map(CORE_STOCKS.map((s) => [s.symbol, s]));

/** Resolve "MC", "MC.PA" or a raw Yahoo/Finnhub symbol. */
export function resolveStock(idOrSymbol: string): StockMeta | undefined {
  const key = idOrSymbol.toUpperCase();
  return byTicker.get(key) ?? bySymbol.get(key);
}

/** Yahoo symbol for any input; unknown tickers pass through unchanged
 *  (lets users chart any real symbol, e.g. from the full exchange listing). */
export function toYahooSymbol(idOrSymbol: string): string {
  return resolveStock(idOrSymbol)?.yahoo ?? idOrSymbol.toUpperCase();
}

export function toFinnhubSymbol(idOrSymbol: string): string {
  return resolveStock(idOrSymbol)?.finnhub ?? idOrSymbol.toUpperCase();
}

export function isRealtimeSymbol(idOrSymbol: string): boolean {
  const meta = resolveStock(idOrSymbol);
  // Unknown symbols: US-looking (no suffix) → Finnhub streams them in real time
  return meta ? meta.realtime : !idOrSymbol.includes('.');
}
