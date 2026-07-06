import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getEnv, unauthorized, type AuthUser } from '@monere/shared';
import { prisma } from './db.js';
import { generateRefreshToken, sha256 } from './crypto.js';
import type { User } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export function toAuthUser(user: User): AuthUser {
  return {
    sub: user.id,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'user',
    premium: user.premium,
  };
}

/** Issues a short-lived access JWT + an opaque refresh token (hash stored). */
export async function issueTokens(
  app: FastifyInstance,
  user: User,
  req: FastifyRequest,
): Promise<TokenPair> {
  const env = getEnv();
  const accessToken = app.signAccessToken(toAuthUser(user));
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000),
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 255),
      ip: req.ip,
    },
  });
  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

/** Rotation: the presented refresh token is revoked and replaced.
 *  A revoked-token replay revokes the whole session family (theft signal). */
export async function rotateRefreshToken(
  app: FastifyInstance,
  presented: string,
  req: FastifyRequest,
): Promise<TokenPair> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(presented) },
    include: { user: true },
  });
  if (!record) throw unauthorized('Session invalide', 'INVALID_REFRESH');
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Session révoquée — reconnectez-vous', 'REFRESH_REUSE');
  }
  if (record.expiresAt < new Date()) throw unauthorized('Session expirée', 'REFRESH_EXPIRED');
  if (record.user.disabled) throw unauthorized('Compte désactivé', 'ACCOUNT_DISABLED');

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  return issueTokens(app, record.user, req);
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
