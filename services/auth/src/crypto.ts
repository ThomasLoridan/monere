import argon2 from 'argon2';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** 6-digit verification code (crypto-random, zero-padded). */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Codes and refresh tokens are stored hashed — a DB leak exposes nothing usable. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}
