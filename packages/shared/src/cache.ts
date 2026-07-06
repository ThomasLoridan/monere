import { Redis } from 'ioredis';
import { getEnv } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('cache');

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  readonly kind: 'redis' | 'memory';
}

/** In-memory cache with TTL — dev fallback when Redis isn't available.
 *  NOT suitable for multi-instance production (documented in README). */
class MemoryCache implements Cache {
  readonly kind = 'memory' as const;
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.store) if (v.expiresAt < now) this.store.delete(k);
    }, 30_000);
    this.sweeper.unref();
  }

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class RedisCache implements Cache {
  readonly kind = 'redis' as const;
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

let instance: Cache | undefined;
let redisClient: Redis | undefined;

/** Redis in docker mode, in-memory in local mode. Memoized per process. */
export async function getCache(): Promise<Cache> {
  if (instance) return instance;
  const env = getEnv();
  if (env.MONERE_MODE === 'docker') {
    try {
      redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
      await redisClient.connect();
      await redisClient.ping();
      instance = new RedisCache(redisClient);
      log.info('cache: redis connected');
      return instance;
    } catch (err) {
      log.warn({ err }, 'cache: redis unreachable, falling back to memory');
      redisClient?.disconnect();
      redisClient = undefined;
    }
  }
  instance = new MemoryCache();
  return instance;
}

/** Raw Redis client if connected (used by rate-limiter). */
export function getRedisClient(): Redis | undefined {
  return redisClient;
}

/** Read-through helper: cache hit or compute + store. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cache = await getCache();
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await compute();
  // Never cache null/undefined — a failed upstream shouldn't poison the cache
  if (value !== null && value !== undefined) await cache.set(key, value, ttlSeconds);
  return value;
}
