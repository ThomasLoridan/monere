import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cached, validate } from '@monere/shared';
import { getQuote, getQuotes } from './quotes.js';
import { getConstituents } from './constituents.js';
import {
  yahooChart,
  yahooQuote,
  yahooSearch,
  yahooRatios,
  type ChartRange,
} from './providers/yahoo.js';
import { fhMetrics, fhProfile, fhSearch, fhSymbols, hasFinnhubKey } from './providers/finnhub.js';
import { CORE_STOCKS, INDEX_DEFS, resolveStock, toYahooSymbol } from './universe.js';
import { addClient } from './stream.js';

const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-^]{1,15}$/, 'Symbole invalide');
const RangeSchema = z.enum(['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX']);

export async function registerMarketRoutes(app: FastifyInstance): Promise<void> {
  // All market data requires a session (the gateway also enforces this).
  app.addHook('onRequest', async (req, reply) => {
    // SSE can't send Authorization headers from EventSource → token via query
    if (req.routeOptions?.url === '/market/stream') {
      const token = (req.query as Record<string, string>)?.token;
      if (!token) return reply.code(401).send({ error: 'UNAUTHORIZED' });
      try {
        req.headers.authorization = `Bearer ${token}`;
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }
      return;
    }
    await app.requireAuth(req, reply);
  });

  /** Reference metadata for the app's core universe (names, domains, indices). */
  app.get('/market/universe', async () => ({
    indices: INDEX_DEFS.map(({ id, name, flag, region }) => ({ id, name, flag, region })),
    stocks: CORE_STOCKS,
  }));

  /** Real index quotes + intraday spark. */
  app.get('/market/indices', async () => {
    return cached('indices:quotes', 20, async () => {
      const results = await Promise.allSettled(
        INDEX_DEFS.map(async (def) => {
          const chart = await yahooChart(def.yahoo, '1D');
          const closes = chart.points.map((p) => p.c).filter((c): c is number => c != null);
          const prev = chart.previousClose;
          return {
            id: def.id,
            name: def.name,
            flag: def.flag,
            region: def.region,
            value: chart.price,
            pct: prev ? ((chart.price - prev) / prev) * 100 : null,
            spark: closes.slice(-40),
            delayed: def.region !== 'US',
            source: chart.source,
            marketTime: chart.marketTime,
          };
        }),
      );
      return {
        indices: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
        unavailable: results.filter((r) => r.status === 'rejected').length,
      };
    });
  });

  /** Full composition of an index (real sources, linked). */
  app.get('/market/indices/:id/constituents', async (req) => {
    const params = validate(
      z.object({ id: z.enum(INDEX_DEFS.map((d) => d.id) as [string, ...string[]]) }),
      req.params,
    );
    return getConstituents(params.id);
  });

  /** Complete exchange listing — "l'entièreté des actions cotées". */
  app.get('/market/listings', async (req) => {
    const q = validate(
      z.object({
        exchange: z.enum(['US', 'PA', 'DE', 'AS', 'L']).default('US'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(10).max(200).default(100),
        search: z.string().trim().max(60).optional(),
      }),
      req.query,
    );
    if (!hasFinnhubKey()) {
      return {
        available: false,
        message:
          'Listing complet indisponible sans clé Finnhub (gratuite) — ajoutez FINNHUB_API_KEY dans .env',
        rows: [],
        total: 0,
        page: 1,
      };
    }
    const all = await cached(`listings:${q.exchange}`, 24 * 3600, () => fhSymbols(q.exchange));
    const filtered = q.search
      ? all.filter(
          (r) =>
            r.symbol.includes(q.search!.toUpperCase()) ||
            r.name.toUpperCase().includes(q.search!.toUpperCase()),
        )
      : all;
    return {
      available: true,
      total: filtered.length,
      page: q.page,
      pageSize: q.pageSize,
      rows: filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      source: {
        name: 'Finnhub — symbol directory',
        url: 'https://finnhub.io/docs/api/stock-symbols',
      },
    };
  });

  /** Batched quotes. */
  app.get('/market/quotes', async (req) => {
    const q = validate(z.object({ symbols: z.string().min(1).max(600) }), req.query);
    const symbols = q.symbols.split(',').map((s) => SymbolSchema.parse(s.trim()));
    return { quotes: await getQuotes(symbols) };
  });

  app.get('/market/quote/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);
    return { quote: await getQuote(params.symbol) };
  });

  /** Real candles. 1D returns only elapsed session bars + session bounds,
   *  so the frontend can draw the progressive intraday curve. */
  app.get('/market/candles/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);
    const q = validate(z.object({ range: RangeSchema.default('1D') }), req.query);
    const range = q.range as ChartRange;
    const ttl = range === '1D' ? 25 : range === '1W' ? 120 : 900;
    const meta = resolveStock(params.symbol);
    const chart = await cached(`candles:${params.symbol}:${range}`, ttl, () =>
      yahooChart(toYahooSymbol(params.symbol), range),
    );
    return {
      ticker: meta?.ticker ?? params.symbol,
      range,
      currency: chart.currency,
      price: chart.price,
      previousClose: chart.previousClose,
      session: chart.session,
      timezone: chart.timezone,
      delayed: meta ? !meta.realtime : params.symbol.includes('.'),
      points: chart.points.filter((p) => p.c != null),
      source: chart.source,
    };
  });

  /** Company profile + real financial ratios (Finnhub fundamentals). */
  app.get('/market/profile/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);
    const meta = resolveStock(params.symbol);
    const fhSym = meta?.finnhub ?? params.symbol;
    const ySym = toYahooSymbol(params.symbol);

    // Finnhub d'abord (US, temps quasi réel) ; si la place n'est pas couverte
    // par le plan (403 sur EU/UK) ou métriques vides → Yahoo quoteSummary (réel).
    const ratios = await cached(`ratios:${fhSym}`, 3600, async () => {
      if (hasFinnhubKey()) {
        try {
          const m = await fhMetrics(fhSym);
          const hasData = [m.pe, m.eps, m.beta, m.marketCap].some((v) => v != null);
          if (hasData) return m;
        } catch {
          /* place non couverte par le plan → repli Yahoo */
        }
      }
      return yahooRatios(ySym);
    }).catch(() => null);

    const [profile, quote] = await Promise.all([
      hasFinnhubKey()
        ? cached(`profile:${fhSym}`, 24 * 3600, () => fhProfile(fhSym)).catch(() => null)
        : Promise.resolve(null),
      getQuote(params.symbol).catch(() => null),
    ]);

    return {
      ticker: meta?.ticker ?? params.symbol,
      meta: meta ?? null,
      profile,
      ratios,
      quote,
      ...(ratios ? {} : { message: 'Ratios momentanément indisponibles auprès des sources.' }),
    };
  });

  /** Symbol/company search (Finnhub, Yahoo fallback). */
  app.get('/market/search', async (req) => {
    const q = validate(z.object({ q: z.string().trim().min(1).max(60) }), req.query);
    const results = await cached(`search:${q.q.toLowerCase()}`, 300, async () => {
      if (hasFinnhubKey()) {
        try {
          return await fhSearch(q.q);
        } catch {
          /* fall through to yahoo */
        }
      }
      return yahooSearch(q.q);
    });
    return { results };
  });

  /** Server-Sent Events — real-time quote stream (≤15s refresh + WS pushes). */
  app.get('/market/stream', async (req, reply) => {
    const q = validate(
      z.object({ symbols: z.string().min(1).max(600), token: z.string() }),
      req.query,
    );
    const symbols = q.symbols.split(',').map((s) => SymbolSchema.parse(s.trim()));

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const remove = addClient(symbols, send);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      remove();
    });
    return reply; // keep the connection open
  });

  /** Provider/status transparency for the UI + admin dashboard. */
  app.get('/market/status', async () => ({
    finnhub: hasFinnhubKey() ? 'configured' : 'missing-key',
    chartProvider: 'yahoo',
    realtime: {
      us: hasFinnhubKey() ? 'websocket + poll 15s' : 'poll 15s (yahoo)',
      eu: 'delayed (free tier)',
    },
    freshnessTargetSeconds: 30,
  }));
}
