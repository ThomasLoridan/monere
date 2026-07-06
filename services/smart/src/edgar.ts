/**
 * SEC EDGAR client — official, free source for 13F (institutional holdings)
 * and Form 4 (insider transactions). SEC fair-access rules: descriptive
 * User-Agent + ≤10 req/s (we stay far below and cache aggressively).
 */
import { cached, createLogger, fetchJson, getEnv, upstreamUnavailable } from '@monere/shared';

const log = createLogger('smart-edgar');

function headers(): Record<string, string> {
  return { 'user-agent': getEnv().SEC_EDGAR_USER_AGENT, accept: 'application/json' };
}

const pad = (cik: string | number) => String(cik).padStart(10, '0');

interface SubmissionsResponse {
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
    };
  };
}

export async function getSubmissions(cik: string | number): Promise<SubmissionsResponse> {
  return cached(`edgar:sub:${cik}`, 6 * 3600, () =>
    fetchJson<SubmissionsResponse>(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, {
      headers: headers(),
      timeoutMs: 15_000,
    }),
  );
}

export interface FilingRef {
  accession: string;
  form: string;
  filed: string;
  reportDate: string;
  primaryDocument: string;
  indexUrl: string;
}

export function recentFilings(
  sub: SubmissionsResponse,
  cik: string | number,
  forms: string[],
  limit = 5,
): FilingRef[] {
  const r = sub.filings.recent;
  const out: FilingRef[] = [];
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    if (!forms.includes(r.form[i]!)) continue;
    const accession = r.accessionNumber[i]!;
    const accNoDash = accession.replace(/-/g, '');
    out.push({
      accession,
      form: r.form[i]!,
      filed: r.filingDate[i]!,
      reportDate: r.reportDate[i]!,
      primaryDocument: r.primaryDocument[i]!,
      indexUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accNoDash}`,
    });
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': getEnv().SEC_EDGAR_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw upstreamUnavailable(`EDGAR ${res.status} pour ${url}`);
  return res.text();
}

// ── 13F information table ────────────────────────────────────
export interface Holding {
  issuer: string;
  cusip: string;
  valueUsd: number;
  shares: number;
  pct: number;
}

/** Parse the 13F info-table XML (regex-based; the format is rigidly regular). */
export function parse13FInfoTable(xml: string): Omit<Holding, 'pct'>[] {
  const holdings: Omit<Holding, 'pct'>[] = [];
  const entries = xml.split(/<(?:\w+:)?infoTable>/i).slice(1);
  for (const entry of entries) {
    const tag = (name: string) => {
      const m = entry.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)<`, 'i'));
      return m?.[1]?.trim() ?? '';
    };
    const issuer = tag('nameOfIssuer');
    const value = Number(tag('value'));
    const shares = Number(entry.match(/<(?:\w+:)?sshPrnamt>([^<]*)</i)?.[1] ?? 0);
    if (!issuer || !Number.isFinite(value)) continue;
    holdings.push({ issuer, cusip: tag('cusip'), valueUsd: value, shares });
  }
  return holdings;
}

/** Latest 13F holdings for a filer CIK, aggregated per issuer, top N by value.
 *  Note: `value` in 13F info tables is reported in USD (since 2023-01). */
export async function get13F(cik: string | number, top = 15) {
  return cached(`edgar:13f:${cik}`, 24 * 3600, async () => {
    const sub = await getSubmissions(cik);
    const filings = recentFilings(sub, cik, ['13F-HR', '13F-HR/A'], 2);
    if (filings.length === 0) throw upstreamUnavailable('Aucun 13F-HR trouvé sur EDGAR');
    const filing = filings[0]!;

    // Locate the info-table XML in the filing directory
    const index = await fetchJson<{ directory: { item: Array<{ name: string }> } }>(
      `${filing.indexUrl}/index.json`,
      { headers: headers(), timeoutMs: 15_000 },
    );
    const xmlFiles = index.directory.item
      .map((i) => i.name)
      .filter((n) => n.toLowerCase().endsWith('.xml') && !n.toLowerCase().includes('primary_doc'));
    if (xmlFiles.length === 0) throw upstreamUnavailable('Info table 13F introuvable');
    // The info table is by far the largest XML; try candidates in order
    let rows: Omit<Holding, 'pct'>[] = [];
    for (const f of xmlFiles) {
      const xml = await fetchText(`${filing.indexUrl}/${f}`);
      rows = parse13FInfoTable(xml);
      if (rows.length > 0) break;
    }
    if (rows.length === 0) throw upstreamUnavailable('Info table 13F illisible');

    // Aggregate by issuer (funds often report multiple lots/classes)
    const byIssuer = new Map<string, Omit<Holding, 'pct'>>();
    for (const h of rows) {
      const prev = byIssuer.get(h.issuer);
      if (prev) {
        prev.valueUsd += h.valueUsd;
        prev.shares += h.shares;
      } else {
        byIssuer.set(h.issuer, { ...h });
      }
    }
    const totalValue = [...byIssuer.values()].reduce((a, b) => a + b.valueUsd, 0);
    const holdings: Holding[] = [...byIssuer.values()]
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, top)
      .map((h) => ({
        ...h,
        pct: totalValue ? Math.round((h.valueUsd / totalValue) * 1000) / 10 : 0,
      }));

    return {
      filerName: sub.name,
      reportDate: filing.reportDate,
      filed: filing.filed,
      totalValueUsd: totalValue,
      positions: byIssuer.size,
      holdings,
      source: { name: 'SEC EDGAR — 13F-HR (officiel)', url: filing.indexUrl },
    };
  });
}

// ── Form 4 (insider transactions) ────────────────────────────
export interface InsiderTx {
  owner: string;
  role: string;
  isTenBFivePlan: boolean;
  transactions: Array<{
    date: string;
    code: string; // P=achat, S=vente, A=attribution…
    shares: number;
    price: number | null;
    acquired: boolean;
  }>;
  filed: string;
  url: string;
}

function xmlTag(src: string, name: string): string {
  const m = src.match(new RegExp(`<${name}>\\s*(?:<value>)?([^<]*)`, 'i'));
  return m?.[1]?.trim() ?? '';
}

export function parseForm4(xml: string, url: string, filed: string): InsiderTx | null {
  const owner = xmlTag(xml, 'rptOwnerName');
  if (!owner) return null;
  const isOfficer =
    xmlTag(xml, 'isOfficer') === '1' || xmlTag(xml, 'isOfficer').toLowerCase() === 'true';
  const officerTitle = xmlTag(xml, 'officerTitle');
  const isDirector =
    xmlTag(xml, 'isDirector') === '1' || xmlTag(xml, 'isDirector').toLowerCase() === 'true';
  const role = officerTitle || (isOfficer ? 'Officer' : isDirector ? 'Director' : 'Insider');

  const transactions: InsiderTx['transactions'] = [];
  const blocks = xml.split(/<nonDerivativeTransaction>/i).slice(1);
  for (const b of blocks) {
    const code = xmlTag(b, 'transactionCode');
    const shares = Number(xmlTag(b, 'transactionShares')) || 0;
    const price = Number(xmlTag(b, 'transactionPricePerShare')) || null;
    const date = xmlTag(b, 'transactionDate');
    const ad = xmlTag(b, 'transactionAcquiredDisposedCode');
    if (!date) continue;
    transactions.push({ date, code, shares, price, acquired: ad === 'A' });
  }
  return {
    owner,
    role,
    isTenBFivePlan: /10b5-1/i.test(xml),
    transactions,
    filed,
    url,
  };
}

/** Recent insider transactions (Form 4) for a company CIK. */
export async function getInsiderActivity(cik: string | number, limit = 6) {
  return cached(`edgar:form4:${cik}`, 6 * 3600, async () => {
    const sub = await getSubmissions(cik);
    const filings = recentFilings(sub, cik, ['4'], limit);
    const results: InsiderTx[] = [];
    for (const f of filings) {
      try {
        const xml = await fetchText(`${f.indexUrl}/${f.primaryDocument.split('/').pop()}`);
        const parsed = parseForm4(xml, f.indexUrl, f.filed);
        if (parsed && parsed.transactions.length > 0) results.push(parsed);
      } catch (err) {
        log.debug({ err, filing: f.accession }, 'form 4 parse failed');
      }
    }
    return {
      company: sub.name,
      insiders: results,
      source: {
        name: 'SEC EDGAR — Form 4 (officiel)',
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pad(cik)}&type=4&dateb=&owner=include&count=40`,
      },
    };
  });
}
