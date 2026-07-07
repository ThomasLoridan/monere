import { buildService, startService, getEnv, getCache, validate } from '@monere/shared';
import { z } from 'zod';
import { companyNews, marketNews, type NewsItem } from './provider.js';

const env = getEnv();
await getCache();

const app = await buildService({ name: 'news', port: env.NEWS_PORT });

const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-]{1,15}$/);

// ── Routes internes (service-à-service, x-internal-key) ─────
app.register(async (scoped) => {
  scoped.addHook('onRequest', async (req, reply) => {
    await scoped.requireInternal(req, reply);
  });

  /** Actualités « dernière minute » (<45 min) pour une liste de valeurs —
   *  consommé par le job de notifications du service auth. */
  scoped.get('/internal/breaking', async (req) => {
    const q = validate(z.object({ symbols: z.string().min(1).max(600) }), req.query);
    const symbols = [
      ...new Set(
        q.symbols
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z0-9.\-]{1,15}$/.test(s)),
      ),
    ].slice(0, 25);
    const results = await Promise.allSettled(symbols.map((s) => companyNews(s, 1)));
    const items: NewsItem[] = results.flatMap((r, i) =>
      r.status === 'fulfilled' && r.value.available
        ? r.value.items.filter((n) => n.breaking).map((n) => ({ ...n, ticker: symbols[i]! }))
        : [],
    );
    return { items };
  });
});

app.register(async (scoped) => {
  scoped.addHook('onRequest', async (req, reply) => {
    await scoped.requireAuth(req, reply);
  });

  /** News for one company — real articles with links. */
  scoped.get('/news/company/:symbol', async (req) => {
    const params = validate(z.object({ symbol: SymbolSchema }), req.params);
    const q = validate(
      z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }),
      req.query,
    );
    return companyNews(params.symbol, q.days);
  });

  /** Market-wide feed. */
  scoped.get('/news/market', async () => marketNews());

  /** Aggregated feed: market headlines + a set of tickers (watchlist). */
  scoped.get('/news/feed', async (req) => {
    const q = validate(z.object({ symbols: z.string().max(400).optional() }), req.query);
    const symbols = (q.symbols ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9.\-]{1,15}$/.test(s))
      .slice(0, 12);

    const [market, ...companies] = await Promise.all([
      marketNews(),
      ...symbols.map((s) => companyNews(s, 5)),
    ]);
    if (!market.available) return market;

    const items: NewsItem[] = [
      ...market.items.map((n) => ({ ...n, kind: 'market' as const })),
      ...companies.flatMap((c, i) =>
        c.items.slice(0, 6).map((n) => ({ ...n, kind: 'company' as const, ticker: symbols[i] })),
      ),
    ];
    // de-dupe by URL, newest first
    const seen = new Set<string>();
    const deduped = items
      .filter((n) => (seen.has(n.url) ? false : (seen.add(n.url), true)))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 60);
    return { available: true, items: deduped };
  });
});

await startService(app, 'news', env.NEWS_PORT);
