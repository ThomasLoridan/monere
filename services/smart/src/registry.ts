/**
 * Curated registries — REFERENCE data only (identities + SEC CIK numbers).
 * All figures shown in the app come live from EDGAR filings.
 * CIKs are public identifiers, verifiable at
 * https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<cik>
 */

export interface InvestorDef {
  id: string;
  name: string;
  firm: string;
  kind: 'billionaires' | 'funds';
  cik: string;
  note: string;
  grad: string;
}

export const INVESTORS: InvestorDef[] = [
  {
    id: 'buffett',
    name: 'Warren Buffett',
    firm: 'Berkshire Hathaway',
    kind: 'billionaires',
    cik: '1067983',
    note: 'Concentration historique sur la qualité et le pricing power.',
    grad: 'linear-gradient(135deg,#0F3D2E,#15803D)',
  },
  {
    id: 'ackman',
    name: 'Bill Ackman',
    firm: 'Pershing Square Capital',
    kind: 'billionaires',
    cik: '1336528',
    note: 'Portefeuille ultra-concentré, fort activisme.',
    grad: 'linear-gradient(135deg,#3730A3,#6366F1)',
  },
  {
    id: 'burry',
    name: 'Michael Burry',
    firm: 'Scion Asset Management',
    kind: 'billionaires',
    cik: '1649339',
    note: 'Le « Big Short ». Contrarian, rotation rapide.',
    grad: 'linear-gradient(135deg,#374151,#6B7280)',
  },
  {
    id: 'citadel',
    name: 'Ken Griffin',
    firm: 'Citadel Advisors',
    kind: 'funds',
    cik: '1423053',
    note: 'Multi-stratégie ; le 13F ne reflète qu’une fraction du book.',
    grad: 'linear-gradient(135deg,#312E81,#4F46E5)',
  },
  {
    id: 'millennium',
    name: 'Izzy Englander',
    firm: 'Millennium Management',
    kind: 'funds',
    cik: '1273087',
    note: 'Plateforme multi-gérants, diversification systématique.',
    grad: 'linear-gradient(135deg,#155E75,#0891B2)',
  },
  {
    id: 'renaissance',
    name: 'Renaissance Technologies',
    firm: 'RIEF · Medallion externe',
    kind: 'funds',
    cik: '1037389',
    note: 'Quant systématique pur, rotation trimestrielle quasi complète.',
    grad: 'linear-gradient(135deg,#78350F,#B45309)',
  },
  {
    id: 'thirdpoint',
    name: 'Dan Loeb',
    firm: 'Third Point LLC',
    kind: 'funds',
    cik: '1040273',
    note: 'Activiste event-driven, convictions concentrées.',
    grad: 'linear-gradient(135deg,#7C2D12,#EA580C)',
  },
  {
    id: 'tigerglobal',
    name: 'Chase Coleman',
    firm: 'Tiger Global Management',
    kind: 'funds',
    cik: '1167483',
    note: 'Tech growth, leaders logiciels et internet.',
    grad: 'linear-gradient(135deg,#065F46,#059669)',
  },
];

/** Companies tracked for insider (Form 4) activity. Company CIKs are public. */
export const INSIDER_COMPANIES: Array<{ ticker: string; name: string; cik: string }> = [
  { ticker: 'AAPL', name: 'Apple Inc.', cik: '320193' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', cik: '789019' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', cik: '1045810' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', cik: '1652044' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', cik: '1018724' },
  { ticker: 'TSLA', name: 'Tesla Inc.', cik: '1318605' },
  { ticker: 'META', name: 'Meta Platforms', cik: '1326801' },
];

export function investorById(id: string): InvestorDef | undefined {
  return INVESTORS.find((i) => i.id === id);
}

export function insiderCompany(
  ticker: string,
): { ticker: string; name: string; cik: string } | undefined {
  return INSIDER_COMPANIES.find((c) => c.ticker === ticker.toUpperCase());
}
