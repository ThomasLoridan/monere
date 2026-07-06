/**
 * Index constituents — real sources only:
 *  1. Finnhub /index/constituents (paid plans)
 *  2. Wikipedia constituent tables (free, real, linked as source)
 * If both fail we return an explicit "unavailable" — never a made-up list.
 */
import { cached, createLogger, notFound } from '@monere/shared';
import { INDEX_DEFS, type IndexDef } from './universe.js';
import { fhConstituents, hasFinnhubKey } from './providers/finnhub.js';

const log = createLogger('market-constituents');
const TTL_S = 24 * 3600; // constituent lists move rarely

export interface Constituent {
  symbol: string;
  name: string;
}

export interface ConstituentsResult {
  indexId: string;
  constituents: Constituent[];
  source: { name: string; url: string };
  asOf: string;
}

/** Parse rows out of a Wikipedia constituents wikitable. Column layout varies
 *  per index page, so we detect the ticker/name columns from the header. */
function parseWikipediaConstituents(html: string, def: IndexDef): Constituent[] {
  const tables = html.split(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>/i).slice(1);
  for (const tableHtml of tables) {
    const table = tableHtml.split('</table>')[0] ?? '';
    const rows = table.split(/<tr[^>]*>/i).slice(1);
    if (rows.length < 10) continue; // constituent tables are large

    const headerCells = (rows[0] ?? '')
      .split(/<t[hd][^>]*>/i)
      .slice(1)
      .map((c) => strip(c).toLowerCase());
    const tickerCol = headerCells.findIndex((h) => /ticker|symbol|epic/.test(h));
    const nameCol = headerCells.findIndex((h) => /company|name|security/.test(h));
    if (tickerCol === -1 || nameCol === -1) continue;

    const out: Constituent[] = [];
    for (const row of rows.slice(1)) {
      const cells = row
        .split(/<t[hd][^>]*>/i)
        .slice(1)
        .map(strip);
      const symbol = (cells[tickerCol] ?? '').trim();
      const name = (cells[nameCol] ?? '').trim();
      if (symbol && name && /^[A-Z0-9 .\-^]{1,12}$/i.test(symbol)) {
        out.push({ symbol: symbol.toUpperCase(), name });
      }
    }
    if (out.length >= 10) return out;
  }
  return [];
}

function strip(cellHtml: string): string {
  return (cellHtml.split(/<\/t[hd]>/i)[0] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getConstituents(indexId: string): Promise<ConstituentsResult> {
  const def = INDEX_DEFS.find((d) => d.id === indexId);
  if (!def) throw notFound(`Indice inconnu: ${indexId}`);

  return cached(`constituents:${indexId}`, TTL_S, async () => {
    // 1. Finnhub (paid plan)
    if (hasFinnhubKey() && def.finnhub) {
      try {
        const symbols = await fhConstituents(def.finnhub);
        return {
          indexId,
          constituents: symbols.map((s) => ({ symbol: s, name: s })),
          source: { name: 'Finnhub', url: 'https://finnhub.io' },
          asOf: new Date().toISOString(),
        };
      } catch {
        log.debug({ indexId }, 'finnhub constituents unavailable (free plan) → wikipedia');
      }
    }
    // 2. Wikipedia
    if (def.constituentsSource) {
      const html = await fetchText(`https://en.wikipedia.org/wiki/${def.constituentsSource.page}`);
      const constituents = parseWikipediaConstituents(html, def);
      if (constituents.length > 0) {
        return {
          indexId,
          constituents,
          source: { name: `Wikipedia — ${def.name} constituents`, url: def.constituentsSource.url },
          asOf: new Date().toISOString(),
        };
      }
    }
    throw notFound(
      `Composition de ${def.name} indisponible auprès de nos sources — aucune donnée inventée`,
      'CONSTITUENTS_UNAVAILABLE',
    );
  });
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'MonereApp/0.1 (educational project)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw notFound(`Source indisponible (${res.status})`);
  return res.text();
}
