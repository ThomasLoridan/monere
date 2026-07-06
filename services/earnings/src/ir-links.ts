/**
 * Official investor-relations pages — the real place to follow earnings calls
 * (webcast registration, releases). Static reference data, all links verified
 * against the companies' own IR sites.
 */
export const IR_PAGES: Record<string, { name: string; url: string }> = {
  AAPL: { name: 'Apple Investor Relations', url: 'https://investor.apple.com' },
  MSFT: { name: 'Microsoft Investor Relations', url: 'https://www.microsoft.com/en-us/investor' },
  NVDA: { name: 'NVIDIA Investor Relations', url: 'https://investor.nvidia.com' },
  GOOGL: { name: 'Alphabet Investor Relations', url: 'https://abc.xyz/investor' },
  AMZN: { name: 'Amazon Investor Relations', url: 'https://ir.aboutamazon.com' },
  TSLA: { name: 'Tesla Investor Relations', url: 'https://ir.tesla.com' },
  META: { name: 'Meta Investor Relations', url: 'https://investor.atmeta.com' },
  MC: { name: 'LVMH Investors', url: 'https://www.lvmh.com/investors' },
  OR: { name: "L'Oréal Finance", url: 'https://www.loreal-finance.com' },
  AIR: { name: 'Airbus Investors', url: 'https://www.airbus.com/en/investors' },
  BNP: { name: 'BNP Paribas Investors', url: 'https://invest.bnpparibas' },
  SAN: { name: 'Sanofi Investors', url: 'https://www.sanofi.com/en/investors' },
  SAP: { name: 'SAP Investor Relations', url: 'https://www.sap.com/investors' },
  SIE: { name: 'Siemens Investor Relations', url: 'https://www.siemens.com/investor' },
  ASML: { name: 'ASML Investors', url: 'https://www.asml.com/en/investors' },
  NVO: { name: 'Novo Nordisk Investors', url: 'https://www.novonordisk.com/investors.html' },
};

export function irLink(ticker: string): { name: string; url: string } | null {
  return IR_PAGES[ticker.toUpperCase().split('.')[0] ?? ''] ?? null;
}
