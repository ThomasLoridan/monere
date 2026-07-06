import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import { randomUUID } from 'node:crypto';
import { getEnv } from './env.js';
import { getRedisClient } from './cache.js';
import { AppError } from './errors.js';

export interface AuthUser {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  premium: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser;
  }
}

export interface ServiceOptions {
  name: string;
  port: number;
  /** Per-route rate limit default; the gateway also applies a global one. */
  rateLimitMax?: number;
}

/**
 * Every Monere micro-service is built from this factory so the security
 * baseline is identical everywhere: helmet, strict CORS, rate limiting,
 * JWT auth decorators, structured logs with request-ids, /health, /metrics.
 *
 * Request path (enforced by construction):
 *   frontend → gateway → [service] auth → validation → business logic → db → response
 */
export async function buildService(opts: ServiceOptions): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger: {
      name: opts.name,
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      base: { service: opts.name },
      // Redact anything that could leak credentials into logs
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.token',
          '*.refreshToken',
          '*.apiKey',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
    trustProxy: true,
    bodyLimit: 1024 * 512, // 512 KB — no legitimate payload is bigger
  });

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: [env.WEB_ORIGIN, 'capacitor://localhost', 'http://localhost'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, {
    max: opts.rateLimitMax ?? env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    redis: getRedisClient(),
    keyGenerator: (req) =>
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
  });
  await app.register(jwt, { secret: env.JWT_SECRET });

  // Typed access-token signer (hides the raw jwt plugin from downstream services)
  app.decorate('signAccessToken', (user: AuthUser): string =>
    app.jwt.sign(user, { expiresIn: env.JWT_ACCESS_TTL }),
  );

  // ── Auth decorators ──────────────────────────────────────
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Authentification requise' });
    }
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Authentification requise' });
    }
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Réservé aux administrateurs' });
    }
  });

  // Service-to-service calls carry the internal key (never exposed to browsers).
  app.decorate('requireInternal', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Internal only' });
    }
  });

  // ── Observability ────────────────────────────────────────
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: `${opts.name.replace(/-/g, '_')}_` });
  const httpDuration = new Histogram({
    name: `${opts.name.replace(/-/g, '_')}_http_request_duration_seconds`,
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  app.addHook('onResponse', async (req, reply) => {
    httpDuration.observe(
      { method: req.method, route: req.routeOptions?.url ?? 'unknown', status: reply.statusCode },
      reply.elapsedTime / 1000,
    );
  });

  app.get('/health', async () => ({ status: 'ok', service: opts.name, uptime: process.uptime() }));
  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', registry.contentType);
    return registry.metrics();
  });

  // ── Uniform error mapping — no stack traces leak to clients ──
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'ERROR', message: err.message });
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply
        .code(429)
        .send({ error: 'RATE_LIMITED', message: 'Trop de requêtes, réessayez plus tard' });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'INTERNAL', message: 'Erreur interne du serveur' });
  });

  return app;
}

// Augmentations shipped in the d.ts so every service sees the same surface
// without importing @fastify/jwt's types directly.
declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireInternal: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    signAccessToken: (user: AuthUser) => string;
  }
  interface FastifyRequest {
    user: AuthUser;
    jwtVerify(): Promise<AuthUser>;
  }
}

/** Boot helper with graceful shutdown. */
export async function startService(
  app: FastifyInstance,
  name: string,
  port: number,
): Promise<void> {
  const close = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void close('SIGINT'));
  process.on('SIGTERM', () => void close('SIGTERM'));

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`${name} listening on :${port}`);
}
