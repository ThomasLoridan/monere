import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getEnv,
  validate,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  tooMany,
} from '@monere/shared';
import { prisma } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  generateVerificationCode,
  sha256,
  safeEqualHex,
} from '../crypto.js';
import { sendVerificationEmail } from '../email.js';
import { issueTokens, rotateRefreshToken, revokeRefreshToken } from '../tokens.js';
import { audit } from '../audit.js';

const CODE_TTL_MS = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

const EmailSchema = z.string().trim().toLowerCase().email().max(254);
const PasswordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .max(128)
  .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir un chiffre');

async function createAndSendCode(userId: string, email: string, purpose: 'signup' | 'reset') {
  // Invalidate previous outstanding codes for this purpose
  await prisma.verificationCode.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const code = generateVerificationCode();
  await prisma.verificationCode.create({
    data: {
      userId,
      purpose,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return sendVerificationEmail(email, code, purpose);
}

async function consumeCode(userId: string, purpose: 'signup' | 'reset', code: string) {
  const record = await prisma.verificationCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record)
    throw badRequest('Aucun code en attente — demandez un nouveau code', 'NO_PENDING_CODE');
  if (record.expiresAt < new Date())
    throw badRequest('Code expiré — demandez un nouveau code', 'CODE_EXPIRED');
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    throw tooMany('Trop de tentatives — demandez un nouveau code', 'CODE_LOCKED');
  }
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });
  if (!safeEqualHex(record.codeHash, sha256(code))) {
    throw badRequest('Code incorrect', 'CODE_MISMATCH');
  }
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const env = getEnv();
  // Auth endpoints get a much stricter rate limit than the rest of the API.
  const strict = {
    config: { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } },
  };

  // ── Signup: account created unverified + code emailed ─────
  app.post('/auth/signup', strict, async (req, reply) => {
    const body = validate(z.object({ email: EmailSchema, password: PasswordSchema }), req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing?.emailVerified)
      throw conflict('Un compte existe déjà avec cet e-mail', 'EMAIL_TAKEN');

    const passwordHash = await hashPassword(body.password);
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } })
      : await prisma.user.create({ data: { email: body.email, passwordHash } });

    const result = await createAndSendCode(user.id, user.email, 'signup');
    audit('auth.signup', req, { userId: user.id });
    return reply.code(201).send({
      ok: true,
      verificationRequired: true,
      emailSent: result.sent,
      // devCode is only ever present in development without RESEND_API_KEY
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  });

  // ── Verify email with the 6-digit code → session ──────────
  app.post('/auth/verify', strict, async (req) => {
    const body = validate(
      z.object({
        email: EmailSchema,
        code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
      }),
      req.body,
    );
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw badRequest('Code incorrect', 'CODE_MISMATCH'); // do not reveal account existence
    await consumeCode(user.id, 'signup', body.code);
    const verified = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, lastLoginAt: new Date() },
    });
    audit('auth.verify', req, { userId: user.id });
    const tokens = await issueTokens(app, verified, req);
    return { ok: true, ...tokens, user: publicUser(verified) };
  });

  // ── Resend a code ──────────────────────────────────────────
  app.post('/auth/resend', strict, async (req) => {
    const body = validate(z.object({ email: EmailSchema }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Uniform response — never reveal whether the account exists
    if (!user || user.emailVerified) return { ok: true };
    const result = await createAndSendCode(user.id, user.email, 'signup');
    audit('auth.resend', req, { userId: user.id });
    return { ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) };
  });

  // ── Login ──────────────────────────────────────────────────
  app.post('/auth/login', strict, async (req) => {
    const body = validate(
      z.object({ email: EmailSchema, password: z.string().min(1).max(128) }),
      req.body,
    );
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const valid = user && (await verifyPassword(user.passwordHash, body.password));
    if (!user || !valid) {
      audit('auth.login.failed', req, { detail: { email: body.email } });
      throw unauthorized('E-mail ou mot de passe incorrect', 'BAD_CREDENTIALS');
    }
    if (user.disabled)
      throw forbidden('Compte désactivé — contactez le support', 'ACCOUNT_DISABLED');
    if (!user.emailVerified) {
      const result = await createAndSendCode(user.id, user.email, 'signup');
      return {
        ok: false,
        verificationRequired: true,
        message: 'E-mail non vérifié — un nouveau code vient d’être envoyé',
        ...(result.devCode ? { devCode: result.devCode } : {}),
      };
    }
    const fresh = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    audit('auth.login', req, { userId: user.id });
    const tokens = await issueTokens(app, fresh, req);
    return { ok: true, ...tokens, user: publicUser(fresh) };
  });

  // ── Refresh (rotation) / logout ────────────────────────────
  app.post('/auth/refresh', async (req) => {
    const body = validate(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
    const tokens = await rotateRefreshToken(app, body.refreshToken, req);
    return { ok: true, ...tokens };
  });

  app.post('/auth/logout', async (req) => {
    const body = validate(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
    await revokeRefreshToken(body.refreshToken);
    return { ok: true };
  });

  // ── Password reset (same code mechanics) ──────────────────
  app.post('/auth/password-reset/request', strict, async (req) => {
    const body = validate(z.object({ email: EmailSchema }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return { ok: true }; // uniform response
    const result = await createAndSendCode(user.id, user.email, 'reset');
    audit('auth.reset.request', req, { userId: user.id });
    return { ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) };
  });

  app.post('/auth/password-reset/confirm', strict, async (req) => {
    const body = validate(
      z.object({
        email: EmailSchema,
        code: z.string().regex(/^\d{6}$/),
        newPassword: PasswordSchema,
      }),
      req.body,
    );
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw badRequest('Code incorrect', 'CODE_MISMATCH');
    await consumeCode(user.id, 'reset', body.code);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.newPassword), emailVerified: true },
      }),
      // Password change kills every active session
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    audit('auth.reset.confirm', req, { userId: user.id });
    return { ok: true, message: 'Mot de passe mis à jour — reconnectez-vous' };
  });
}

export function publicUser(u: {
  id: string;
  email: string;
  role: string;
  premium: boolean;
  premiumSince: Date | null;
  emailVerified: boolean;
  notifPrefs: string;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    premium: u.premium,
    premiumSince: u.premiumSince,
    emailVerified: u.emailVerified,
    notifPrefs: JSON.parse(u.notifPrefs) as Record<string, boolean>,
    createdAt: u.createdAt,
  };
}
