import { buildService, startService, getEnv, getCache, validate } from '@monere/shared';
import { z } from 'zod';
import { calendar, priceImpact, surpriseHistory } from './provider.js';
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

  /** Company deep-dive: next event, surprise history, beat stats,
   *  real ±1-day price impact for the recent prints, IR link. */
  scoped.get('/earnings/company/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);
    const from = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

    const [cal, hist] = await Promise.all([
      calendar(from, to, [params.symbol]),
      surpriseHistory(params.symbol),
    ]);
    if (!cal.available) return cal;

    const past = cal.events.filter((e) => e.status === 'past').slice(-6);
    const impacts = await Promise.all(past.map((e) => priceImpact(params.symbol, e.date)));
    const withImpact = past.map((e, i) => ({ ...e, priceImpact: impacts[i] }));

    return {
      available: true,
      ticker: params.symbol,
      upcoming: cal.events.filter((e) => e.status === 'upcoming'),
      past: withImpact,
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
