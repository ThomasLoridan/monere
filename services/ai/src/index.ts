import {
  buildService,
  startService,
  getEnv,
  getCache,
  validate,
  cached,
  unauthorized,
} from '@monere/shared';
import { z } from 'zod';
import { hasAnthropicKey, summarizeNews, simulatorInsight } from './claude.js';
import { getCompanyNews, getQuote, getEarnings } from './context.js';

const env = getEnv();
await getCache();

// LLM calls are expensive → much stricter rate limit than the data services.
const app = await buildService({ name: 'ai', port: env.AI_PORT, rateLimitMax: 20 });

const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-]{1,15}$/);

app.register(async (scoped) => {
  scoped.addHook('onRequest', async (req, reply) => {
    await scoped.requireAuth(req, reply);
  });

  scoped.get('/ai/status', async () => ({
    available: hasAnthropicKey(),
    model: env.ANTHROPIC_MODEL,
    message: hasAnthropicKey() ? null : 'ANTHROPIC_API_KEY manquant dans .env',
  }));

  /** Résumé IA des actualités impactantes d'une action (sources citées). */
  scoped.post('/ai/news-digest', async (req) => {
    const body = validate(
      z.object({ ticker: SymbolSchema, name: z.string().max(80).nullish() }),
      req.body,
    );
    const bearer = req.headers.authorization;
    if (!bearer) throw unauthorized();

    // Cache 10 min par ticker : les résumés coûtent des tokens, les news bougent peu plus vite
    return cached(`ai:digest:v2:${body.ticker}`, 600, async () => {
      const [news, quote] = await Promise.all([
        getCompanyNews(body.ticker, bearer),
        getQuote(body.ticker, bearer),
      ]);
      const digest = await summarizeNews({
        ticker: body.ticker,
        name: body.name ?? null,
        quote,
        news,
      });
      return { ...digest, generatedAt: new Date().toISOString(), model: env.ANTHROPIC_MODEL };
    });
  });

  /** Analyse IA des paramètres du simulateur (faits sourcés, pas de conseil). */
  scoped.post('/ai/simulator-insight', async (req) => {
    const body = validate(
      z.object({
        ticker: SymbolSchema,
        name: z.string().max(80).nullish(),
        amount: z.number().positive().max(1e9),
        leverage: z.number().min(1).max(20),
        horizonDays: z.number().int().min(1).max(365),
        direction: z.enum(['long', 'short']).default('long'),
      }),
      req.body,
    );
    const bearer = req.headers.authorization;
    if (!bearer) throw unauthorized();

    const cacheKey = `ai:sim:${body.ticker}:${body.direction}:${body.leverage}:${body.horizonDays}:${Math.round(body.amount)}`;
    return cached(cacheKey, 600, async () => {
      const [quote, earnings, news] = await Promise.all([
        getQuote(body.ticker, bearer),
        getEarnings(body.ticker, bearer),
        getCompanyNews(body.ticker, bearer),
      ]);
      const result = await simulatorInsight({
        ticker: body.ticker,
        name: body.name ?? null,
        quote,
        params: {
          amount: body.amount,
          leverage: body.leverage,
          horizonDays: body.horizonDays,
          direction: body.direction,
        },
        earnings: earnings
          ? {
              upcoming: earnings.upcoming,
              stats: earnings.history?.stats ?? null,
              pastImpacts: earnings.past.map((p) => ({
                date: p.date,
                d1Pct: p.priceImpact?.d1Pct ?? null,
                d2Pct: p.priceImpact?.d2Pct ?? null,
              })),
            }
          : null,
        news: news.slice(0, 6),
      });
      return { ...result, generatedAt: new Date().toISOString(), model: env.ANTHROPIC_MODEL };
    });
  });
});

await startService(app, 'ai', env.AI_PORT);
