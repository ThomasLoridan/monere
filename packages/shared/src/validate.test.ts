import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

beforeAll(() => {
  process.env.JWT_SECRET = 'x'.repeat(64);
  process.env.INTERNAL_API_KEY = 'y'.repeat(64);
});

describe('validate', () => {
  it('returns parsed data on success', async () => {
    const { validate } = await import('./validate.js');
    const schema = z.object({ email: z.string().email(), n: z.coerce.number() });
    expect(validate(schema, { email: 'a@b.co', n: '3' })).toEqual({ email: 'a@b.co', n: 3 });
  });

  it('throws a 400 AppError with field-level detail', async () => {
    const { validate } = await import('./validate.js');
    const { AppError } = await import('./errors.js');
    const schema = z.object({ email: z.string().email() });
    try {
      validate(schema, { email: 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as InstanceType<typeof AppError>).statusCode).toBe(400);
      expect((err as Error).message).toContain('email');
    }
  });
});

describe('memory cache', () => {
  it('stores and expires values', async () => {
    const { getCache } = await import('./cache.js');
    const cache = await getCache();
    await cache.set('k', { a: 1 }, 60);
    expect(await cache.get('k')).toEqual({ a: 1 });
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('cached() never stores null results', async () => {
    const { cached, getCache } = await import('./cache.js');
    const v = await cached<string | null>('nullkey', 60, async () => null);
    expect(v).toBeNull();
    const cache = await getCache();
    expect(await cache.get('nullkey')).toBeNull();
  });
});
