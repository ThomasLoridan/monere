import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cached, validate } from '@monere/shared';
import { yahooChart, yahooQuoteSummary, type ChartRange } from './providers/yahoo.js';
import { toYahooSymbol } from './universe.js';

/** Service-to-service market data (x-internal-key) — used by the earnings
 *  service to compute real price impact around report dates. */
export async function registerInternalMarketRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    await app.requireInternal(req, reply);
  });

  /** Fondamentaux Yahoo (crumb géré ici) — utilisé par le service earnings
   *  pour les places non couvertes par le plan Finnhub (EU/UK). */
  app.get('/internal/quotesummary/:symbol', async (req) => {
    const params = validate(
      z.object({ symbol: z.string().trim().toUpperCase().max(15) }),
      req.params,
    );
    const q = validate(z.object({ modules: z.string().max(120) }), req.query);
    const modules = q.modules
      .split(',')
      .map((m) => m.trim())
      .filter((m) => /^[a-zA-Z]{3,40}$/.test(m))
      .slice(0, 5);
    const result = await cached(`qsum:${params.symbol}:${modules.join(',')}`, 1800, () =>
      yahooQuoteSummary(toYahooSymbol(params.symbol), modules),
    );
    return { symbol: params.symbol, result };
  });

  app.get('/internal/candles/:symbol', async (req) => {
    const params = validate(
      z.object({ symbol: z.string().trim().toUpperCase().max(15) }),
      req.params,
    );
    const q = validate(
      z.object({ range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y']).default('1Y') }),
      req.query,
    );
    const chart = await cached(`candles:${params.symbol}:${q.range}`, 900, () =>
      yahooChart(toYahooSymbol(params.symbol), q.range as ChartRange),
    );
    return {
      points: chart.points.filter((p) => p.c != null),
      currency: chart.currency,
      source: chart.source,
    };
  });
}
