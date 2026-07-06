import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateVerificationCode,
  sha256,
  safeEqualHex,
  generateRefreshToken,
} from './crypto.js';

describe('password hashing (argon2id)', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('Sup3rSecret!!');
    expect(hash).toContain('$argon2id$');
    expect(await verifyPassword(hash, 'Sup3rSecret!!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('rejects malformed hashes without throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('verification codes', () => {
  it('generates 6-digit zero-padded codes', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('codes are compared via constant-time hash equality', () => {
    const code = generateVerificationCode();
    expect(safeEqualHex(sha256(code), sha256(code))).toBe(true);
    expect(safeEqualHex(sha256(code), sha256('000000' === code ? '000001' : '000000'))).toBe(false);
  });
});

describe('refresh tokens', () => {
  it('are long, url-safe and unique', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
