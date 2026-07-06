/**
 * API Gateway — single public entry point.
 * frontend → gateway → service (auth → validation → logic → db → response)
 *
 * Responsibilities: global rate limiting, security headers, CORS, request-id
 * propagation, routing. Internal service routes (/internal/*) are NEVER
 * exposed — only the explicit prefixes below are proxied.
 */
import httpProxy from '@fastify/http-proxy';
import { buildService, startService, getEnv, getCache, fetchJson } from '@monere/shared';

const env = getEnv();
await getCache();

const app = await buildService({
  name: 'gateway',
  port: env.GATEWAY_PORT,
  rateLimitMax: env.RATE_LIMIT_MAX,
});

const host = (name: string) => (env.MONERE_MODE === 'docker' ? name : 'localhost');

const ROUTES: Array<{ prefix: string; target: string; rewrite: string }> = [
  { prefix: '/api/auth', target: `http://${host('auth')}:${env.AUTH_PORT}`, rewrite: '/auth' },
  { prefix: '/api/me', target: `http://${host('auth')}:${env.AUTH_PORT}`, rewrite: '/me' },
  { prefix: '/api/admin', target: `http://${host('auth')}:${env.AUTH_PORT}`, rewrite: '/admin' },
  {
    prefix: '/api/market',
    target: `http://${host('market')}:${env.MARKET_PORT}`,
    rewrite: '/market',
  },
  { prefix: '/api/news', target: `http://${host('news')}:${env.NEWS_PORT}`, rewrite: '/news' },
  {
    prefix: '/api/earnings',
    target: `http://${host('earnings')}:${env.EARNINGS_PORT}`,
    rewrite: '/earnings',
  },
  { prefix: '/api/smart', target: `http://${host('smart')}:${env.SMART_PORT}`, rewrite: '/smart' },
  { prefix: '/api/ai', target: `http://${host('ai')}:${env.AI_PORT}`, rewrite: '/ai' },
];

for (const route of ROUTES) {
  await app.register(httpProxy, {
    upstream: route.target,
    prefix: route.prefix,
    rewritePrefix: route.rewrite,
    // Propagate correlation id; strip hop-level headers
    replyOptions: {
      rewriteRequestHeaders: (req, headers) => ({
        ...headers,
        'x-request-id': String(req.id),
        'x-forwarded-for': req.ip,
      }),
    },
    // SSE (market stream) needs unbuffered pass-through — http-proxy streams by default
    http: {
      requestOptions: { timeout: 120_000 },
    },
  });
}

/** Aggregated health of the whole platform (used by the admin dashboard). */
app.get('/api/health', async () => {
  const checks = await Promise.all(
    [
      ['auth', env.AUTH_PORT],
      ['market', env.MARKET_PORT],
      ['news', env.NEWS_PORT],
      ['earnings', env.EARNINGS_PORT],
      ['smart', env.SMART_PORT],
      ['ai', env.AI_PORT],
    ].map(async ([name, port]) => {
      try {
        const res = await fetchJson<{ status: string; uptime: number }>(
          `http://${host(String(name))}:${port}/health`,
          { timeoutMs: 3000, retries: 0 },
        );
        return { service: name, status: res.status, uptime: Math.round(res.uptime) };
      } catch {
        return { service: name, status: 'down', uptime: 0 };
      }
    }),
  );
  return {
    gateway: 'ok',
    services: checks,
    allHealthy: checks.every((c) => c.status === 'ok'),
    timestamp: new Date().toISOString(),
  };
});

await startService(app, 'gateway', env.GATEWAY_PORT);
