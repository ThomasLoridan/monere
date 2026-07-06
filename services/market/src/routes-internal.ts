import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cached, validate } from '@monere/shared';
import { yahooChart, type ChartRange } from './providers/yahoo.js';
import { toYahooSymbol } from './universe.js';

/** Service-to-service market data (x-internal-key) — used by the earnings
 *  service to compute real price impact around report dates. */
export async function registerInternalMarketRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    await app.requireInternal(req, reply);
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
