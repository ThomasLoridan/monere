import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate, notFound, badRequest } from '@monere/shared';
import { prisma } from '../db.js';
import { publicUser } from './auth.js';
import { audit } from '../audit.js';

const TickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-]{1,12}$/, 'Ticker invalide');

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  // Registered as an encapsulated plugin: every route here requires a session.
  app.addHook('onRequest', async (req, reply) => {
    await app.requireAuth(req, reply);
  });

  app.get('/me', async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) throw notFound('Compte introuvable');
    return { user: publicUser(user) };
  });

  app.patch('/me', async (req) => {
    const body = validate(
      z.object({
        notifPrefs: z.record(z.string(), z.boolean()).optional(),
      }),
      req.body,
    );
    const data: Record<string, unknown> = {};
    if (body.notifPrefs) data.notifPrefs = JSON.stringify(body.notifPrefs);
    const user = await prisma.user.update({ where: { id: req.user.sub }, data });
    return { user: publicUser(user) };
  });

  // ── Premium (démo — pas de paiement réel branché) ─────────
  app.post('/me/premium', async (req) => {
    const body = validate(z.object({ subscribe: z.boolean() }), req.body);
    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: body.subscribe ? { premium: true, premiumSince: new Date() } : { premium: false },
    });
    audit(body.subscribe ? 'premium.subscribe' : 'premium.unsubscribe', req, { userId: user.id });
    return { user: publicUser(user) };
  });

  // ── Watchlist ─────────────────────────────────────────────
  app.get('/me/watchlist', async (req) => {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'asc' },
    });
    return { tickers: items.map((i) => i.ticker) };
  });

  app.post('/me/watchlist/toggle', async (req) => {
    const body = validate(z.object({ ticker: TickerSchema }), req.body);
    const existing = await prisma.watchlistItem.findUnique({
      where: { userId_ticker: { userId: req.user.sub, ticker: body.ticker } },
    });
    if (existing) {
      await prisma.watchlistItem.delete({ where: { id: existing.id } });
    } else {
      await prisma.watchlistItem.create({ data: { userId: req.user.sub, ticker: body.ticker } });
    }
    const items = await prisma.watchlistItem.findMany({ where: { userId: req.user.sub } });
    return { tickers: items.map((i) => i.ticker), added: !existing };
  });

  // ── Price alerts ──────────────────────────────────────────
  app.get('/me/alerts', async (req) => {
    const alerts = await prisma.priceAlert.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
    });
    return { alerts };
  });

  app.post('/me/alerts', async (req, reply) => {
    const body = validate(
      z.object({
        ticker: TickerSchema,
        direction: z.enum(['above', 'below']),
        target: z.number().positive().finite(),
      }),
      req.body,
    );
    const count = await prisma.priceAlert.count({ where: { userId: req.user.sub } });
    if (count >= 50) throw badRequest('Limite de 50 alertes atteinte', 'ALERT_LIMIT');
    const alert = await prisma.priceAlert.create({ data: { ...body, userId: req.user.sub } });
    return reply.code(201).send({ alert });
  });

  app.patch('/me/alerts/:id', async (req) => {
    const params = validate(z.object({ id: z.string().cuid() }), req.params);
    const body = validate(z.object({ active: z.boolean() }), req.body);
    const { count } = await prisma.priceAlert.updateMany({
      where: { id: params.id, userId: req.user.sub }, // scoped to owner
      data: { active: body.active },
    });
    if (count === 0) throw notFound('Alerte introuvable');
    return { ok: true };
  });

  app.delete('/me/alerts/:id', async (req) => {
    const params = validate(z.object({ id: z.string().cuid() }), req.params);
    const { count } = await prisma.priceAlert.deleteMany({
      where: { id: params.id, userId: req.user.sub },
    });
    if (count === 0) throw notFound('Alerte introuvable');
    return { ok: true };
  });

  // ── Followed investors (Smart money) ──────────────────────
  app.get('/me/following', async (req) => {
    const rows = await prisma.followedInvestor.findMany({ where: { userId: req.user.sub } });
    return { following: rows.map((r) => ({ kind: r.kind, id: r.investorId })) };
  });

  app.post('/me/following/toggle', async (req) => {
    const body = validate(
      z.object({
        kind: z.enum(['congress', 'billionaires', 'funds', 'insiders']),
        id: z.string().trim().min(1).max(64),
      }),
      req.body,
    );
    const where = {
      userId_kind_investorId: { userId: req.user.sub, kind: body.kind, investorId: body.id },
    };
    const existing = await prisma.followedInvestor.findUnique({ where });
    if (existing) await prisma.followedInvestor.delete({ where });
    else
      await prisma.followedInvestor.create({
        data: { userId: req.user.sub, kind: body.kind, investorId: body.id },
      });
    const rows = await prisma.followedInvestor.findMany({ where: { userId: req.user.sub } });
    return { following: rows.map((r) => ({ kind: r.kind, id: r.investorId })), added: !existing };
  });

  // ── Notification center ───────────────────────────────────
  app.get('/me/notifications', async (req) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      notifications: notifications.map((n) => ({ ...n, navParams: JSON.parse(n.navParams) })),
      unread: notifications.filter((n) => !n.read).length,
    };
  });

  app.post('/me/notifications/read-all', async (req) => {
    await prisma.notification.updateMany({
      where: { userId: req.user.sub, read: false },
      data: { read: true },
    });
    return { ok: true };
  });
}
