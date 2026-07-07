import { buildService, startService, getEnv, getCache, validate } from '@monere/shared';
import { z } from 'zod';
import {
  calendar,
  priceImpact,
  surpriseHistory,
  upcomingFor,
  usReportDates,
  matchReportDates,
  type CalendarEvent,
} from './provider.js';
import { irLink } from './ir-links.js';

const env = getEnv();
await getCache();

const app = await buildService({ name: 'earnings', port: env.EARNINGS_PORT });

const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-]{1,15}$/);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

app.register(async (scoped) => {
  scoped.addHook('onRequest', async (req, reply) => {
    await scoped.requireAuth(req, reply);
  });

  /** Calendar window (default: -30d → +60d), optional symbol filter. */
  scoped.get('/earnings/calendar', async (req) => {
    const q = validate(
      z.object({
        from: DateSchema.optional(),
        to: DateSchema.optional(),
        symbols: z.string().max(400).optional(),
      }),
      req.query,
    );
    const from = q.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = q.to ?? new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const symbols = q.symbols
      ?.split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9.\-]{1,15}$/.test(s));
    const result = await calendar(from, to, symbols);
    if (!result.available) return result;
    return { ...result, events: result.events.map((e) => ({ ...e, ir: irLink(e.ticker) })) };
  });

  /** Company deep-dive: next event (Finnhub/Yahoo), surprise history,
   *  beat stats, and past prints dated by the REAL 8-K filings (SEC) with
   *  their measured ±1-day price impact. */
  scoped.get('/earnings/company/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);

    const [upcoming, hist, reportDates] = await Promise.all([
      upcomingFor(params.symbol),
      surpriseHistory(params.symbol),
      usReportDates(params.symbol), // vide pour les valeurs non-US (pas d'EDGAR)
    ]);

    // Événements passés : trimestres publiés (historique réel), datés par le
    // dépôt 8-K officiel correspondant quand il existe (US). Sans date réelle,
    // le trimestre reste visible dans l'historique mais sans impact calculé.
    let past: Array<CalendarEvent & { priceImpact?: unknown }> = [];
    if (hist.available && reportDates.length > 0) {
      const dated = matchReportDates(hist.rows, reportDates);
      const rows = hist.rows.filter((r) => dated.has(r.period)).slice(-6);
      past = rows.map((r) => ({
        id: `${params.symbol.toLowerCase()}-${r.quarter.replace(/\s/g, '').toLowerCase()}`,
        ticker: params.symbol,
        date: dated.get(r.period)!,
        when: 'TBD' as const,
        quarter: r.quarter,
        status: 'past' as const,
        consensus: { eps: r.epsEstimate, revenue: null },
        actual: r.epsActual == null ? null : { eps: r.epsActual, revenue: null },
        surprise: {
          eps:
            r.surprisePct != null
              ? `${r.surprisePct >= 0 ? '+' : ''}${r.surprisePct.toFixed(1)}%`
              : null,
          revenue: null,
        },
        source: {
          name: 'SEC EDGAR — 8-K Results of Operations (officiel)',
          url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(params.symbol)}&type=8-K&dateb=&owner=include&count=10`,
        },
      }));
      const impacts = await Promise.all(past.map((e) => priceImpact(params.symbol, e.date)));
      past = past.map((e, i) => ({ ...e, priceImpact: impacts[i] }));
    }

    const available = upcoming.length > 0 || (hist.available && hist.rows.length > 0);
    if (!available) {
      return {
        available: false,
        message:
          'Aucun événement earnings connu pour cette valeur auprès de nos sources (Finnhub, Yahoo, SEC).',
      };
    }

    return {
      available: true,
      ticker: params.symbol,
      upcoming,
      past,
      history: hist.available ? hist : null,
      ir: irLink(params.symbol),
    };
  });

  /** Standalone impact computation (used by the simulator). */
  scoped.get('/earnings/impact/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);
    const q = validate(z.object({ date: DateSchema }), req.query);
    return priceImpact(params.symbol, q.date);
  });
});

await startService(app, 'earnings', env.EARNINGS_PORT);
