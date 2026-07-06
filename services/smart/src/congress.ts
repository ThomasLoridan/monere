/**
 * US Congress — STOCK Act disclosures, OFFICIAL sources only.
 *
 * House: disclosures-clerk.house.gov publishes a machine-readable yearly index
 * (XFD.zip → XML) of every filing; type "P" = Periodic Transaction Report
 * (the STOCK Act trade disclosure). Each entry links to the official PDF.
 *
 * Senate: efdsearch.senate.gov has no free machine-readable feed — the API
 * says so and links to the official portal instead of inventing data.
 *
 * European elected officials: no equivalent of the STOCK Act exists — MEPs
 * file annual declarations of interests (PDF, no transactions). The API
 * exposes that fact with the official sources.
 */
import { inflateRawSync } from 'node:zlib';
import { cached, createLogger, upstreamUnavailable } from '@monere/shared';

const log = createLogger('smart-congress');

const HOUSE_INDEX = (year: number) =>
  `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`;
const HOUSE_PTR_PDF = (year: number, docId: string) =>
  `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`;

export interface CongressFiling {
  type: 'PTR';
  filed: string; // ISO date
  year: number;
  docId: string;
  /** Official disclosure PDF on disclosures-clerk.house.gov */
  disclosureUrl: string;
}

export interface CongressMember {
  id: string;
  name: string;
  chamber: 'Chambre';
  district: string | null;
  filingCount: number;
  lastFiled: string | null;
  filings: CongressFiling[];
  source: { name: string; url: string };
}

export interface CongressData {
  members: CongressMember[];
  sources: Array<{ name: string; url: string }>;
  partial: boolean;
  note: string;
}

// ── Minimal ZIP reader (single small archive, stored or deflate) ──
function unzipFirstMatching(zip: Buffer, suffix: string): Buffer | null {
  let offset = 0;
  while (offset + 30 <= zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break; // local file header
    const method = zip.readUInt16LE(offset + 8);
    const compSize = zip.readUInt32LE(offset + 18);
    const nameLen = zip.readUInt16LE(offset + 26);
    const extraLen = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = zip.subarray(dataStart, dataStart + compSize);
    if (name.toLowerCase().endsWith(suffix)) {
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    offset = dataStart + compSize;
  }
  return null;
}

function xmlField(entry: string, tag: string): string {
  const m = entry.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1]?.trim() ?? '';
}

function toISO(mdY: string): string {
  const m = mdY.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return mdY;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface ParsedEntry {
  name: string;
  district: string | null;
  filing: CongressFiling;
}

async function fetchHouseIndex(year: number): Promise<ParsedEntry[]> {
  const res = await fetch(HOUSE_INDEX(year), {
    headers: { 'user-agent': 'MonereApp/0.1 (educational project)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw upstreamUnavailable(`Index Chambre ${year} indisponible (${res.status})`);
  const zip = Buffer.from(await res.arrayBuffer());
  const xml = unzipFirstMatching(zip, '.xml');
  if (!xml) throw upstreamUnavailable(`Archive Chambre ${year} illisible`);
  return parseHouseXml(xml.toString('utf8'), year);
}

export function parseHouseXml(xml: string, year: number): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  const entries = xml.split('<Member>').slice(1);
  for (const raw of entries) {
    const entry = raw.split('</Member>')[0] ?? '';
    if (xmlField(entry, 'FilingType') !== 'P') continue; // PTR = trade disclosure
    const last = xmlField(entry, 'Last');
    const first = xmlField(entry, 'First');
    const docId = xmlField(entry, 'DocID');
    const filed = xmlField(entry, 'FilingDate');
    if (!last || !docId) continue;
    out.push({
      name: `${first} ${last}`.trim(),
      district: xmlField(entry, 'StateDst') || null,
      filing: {
        type: 'PTR',
        filed: toISO(filed),
        year,
        docId,
        disclosureUrl: HOUSE_PTR_PDF(year, docId),
      },
    });
  }
  return out;
}

/** Every House member with STOCK Act trade disclosures (current + prev year). */
export async function getCongress(): Promise<CongressData> {
  return cached('smart:congress:v2', 6 * 3600, async () => {
    const currentYear = new Date().getFullYear();
    const results = await Promise.allSettled([
      fetchHouseIndex(currentYear),
      fetchHouseIndex(currentYear - 1),
    ]);
    const entries: ParsedEntry[] = [];
    let failures = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') entries.push(...r.value);
      else {
        failures++;
        log.warn({ err: r.reason }, 'house index fetch failed');
      }
    }

    const members = new Map<string, CongressMember>();
    for (const e of entries) {
      const id = slugify(e.name);
      let m = members.get(id);
      if (!m) {
        m = {
          id,
          name: e.name,
          chamber: 'Chambre',
          district: e.district,
          filingCount: 0,
          lastFiled: null,
          filings: [],
          source: {
            name: 'House Financial Disclosures (officiel)',
            url: 'https://disclosures-clerk.house.gov/FinancialDisclosure',
          },
        };
        members.set(id, m);
      }
      m.filingCount++;
      if (!m.lastFiled || e.filing.filed > m.lastFiled) m.lastFiled = e.filing.filed;
      if (m.filings.length < 40) m.filings.push(e.filing);
    }

    const sorted = [...members.values()]
      .map((m) => ({ ...m, filings: m.filings.sort((a, b) => b.filed.localeCompare(a.filed)) }))
      .sort((a, b) => (b.lastFiled ?? '').localeCompare(a.lastFiled ?? ''));

    return {
      members: sorted,
      sources: [
        {
          name: 'House Financial Disclosures — index officiel',
          url: 'https://disclosures-clerk.house.gov/FinancialDisclosure',
        },
        {
          name: 'Senate Financial Disclosures — portail officiel (pas de flux machine-readable gratuit)',
          url: 'https://efdsearch.senate.gov/search/',
        },
      ],
      partial: failures > 0,
      note: "Chambre des représentants : chaque dépôt « Periodic Transaction Report » (STOCK Act) pointe vers le PDF officiel, qui contient le détail des transactions (tickers, montants, dates). Le Sénat n'expose pas de flux machine-readable gratuit — consulter le portail officiel efdsearch.senate.gov.",
    };
  });
}

/** Why there is no EU section with trades — with the real official sources. */
export const EU_EXPLANATION = {
  available: false,
  title: 'Élus européens : pas de données de transactions publiques',
  explanation:
    "Contrairement au STOCK Act américain qui oblige les membres du Congrès à déclarer chaque transaction boursière sous 45 jours, les députés européens et les parlementaires nationaux de l'UE ne déclarent pas leurs transactions individuelles. Ils publient uniquement des déclarations annuelles d'intérêts privés (participations, mandats, revenus annexes) sans montants de transactions ni dates. Monere n'affiche que des données réelles et sourcées — cette section restera vide tant qu'aucune source officielle n'existe.",
  sources: [
    {
      name: 'Parlement européen — déclarations des députés (officiel)',
      url: 'https://www.europarl.europa.eu/meps/en/search/advanced',
    },
    {
      name: 'Code de conduite des députés européens',
      url: 'https://www.europarl.europa.eu/about-parliament/en/organisation-and-rules/ethics-and-transparency',
    },
  ],
};
