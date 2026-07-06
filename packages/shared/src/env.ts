import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Walk up from cwd to find the repo-root .env (services run from their own dir).
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envFile = findEnvFile();
if (envFile) loadDotenv({ path: envFile });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONERE_MODE: z.enum(['local', 'docker']).default('local'),

  GATEWAY_PORT: z.coerce.number().default(8080),
  AUTH_PORT: z.coerce.number().default(4001),
  MARKET_PORT: z.coerce.number().default(4002),
  NEWS_PORT: z.coerce.number().default(4003),
  EARNINGS_PORT: z.coerce.number().default(4004),
  SMART_PORT: z.coerce.number().default(4005),
  AI_PORT: z.coerce.number().default(4006),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 chars — generate with `openssl rand -hex 32`'),
  INTERNAL_API_KEY: z.string().min(32, 'INTERNAL_API_KEY must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  FINNHUB_API_KEY: z.string().default(''),
  CHART_PROVIDER: z.enum(['finnhub', 'yahoo']).default('yahoo'),

  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),

  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('Monere <onboarding@resend.dev>'),

  SEC_EDGAR_USER_AGENT: z.string().default('Monere/0.1 (contact: dev@monere.local)'),

  ADMIN_EMAIL: z.string().email().default('admin@monere.local'),

  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated environment. Throws at boot with a readable message if invalid. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test hook — reset the memoized env. */
export function resetEnvCache(): void {
  cached = undefined;
}
