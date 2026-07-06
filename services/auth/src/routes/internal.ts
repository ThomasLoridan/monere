import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '@monere/shared';
import { prisma } from '../db.js';

/** Service-to-service endpoints (x-internal-key). Used by the market service
 *  to evaluate price alerts and store triggered notifications. */
export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    await app.requireInternal(req, reply);
  });

  // All active alerts, grouped for the alert-evaluation job
  app.get('/internal/alerts/active', async () => {
    const alerts = await prisma.priceAlert.findMany({
      where: { active: true, triggeredAt: null },
      select: { id: true, userId: true, ticker: true, direction: true, target: true },
    });
    return { alerts };
  });

  // Mark an alert triggered + persist the push notification for the user
  app.post('/internal/alerts/:id/trigger', async (req) => {
    const params = validate(z.object({ id: z.string().cuid() }), req.params);
    const body = validate(
      z.object({
        title: z.string().max(140),
        message: z.string().max(500),
        navScreen: z.string().max(40).optional(),
        navParams: z.record(z.string(), z.unknown()).default({}),
      }),
      req.body,
    );
    const alert = await prisma.priceAlert.findUnique({ where: { id: params.id } });
    if (!alert || alert.triggeredAt) return { ok: false };
    await prisma.$transaction([
      prisma.priceAlert.update({
        where: { id: params.id },
        data: { triggeredAt: new Date(), active: false },
      }),
      prisma.notification.create({
        data: {
          userId: alert.userId,
          category: 'price',
          title: body.title,
          body: body.message,
          navScreen: body.navScreen ?? 'stock',
          navParams: JSON.stringify(body.navParams),
        },
      }),
    ]);
    return { ok: true };
  });

  // Generic notification insert (breaking news fan-out, earnings reminders)
  app.post('/internal/notifications', async (req) => {
    const body = validate(
      z.object({
        userId: z.string().cuid(),
        category: z.enum(['earnings', 'news', 'price', 'smart', 'breaking']),
        title: z.string().max(140),
        message: z.string().max(500),
        navScreen: z.string().max(40).optional(),
        navParams: z.record(z.string(), z.unknown()).default({}),
      }),
      req.body,
    );
    // Respect the user's notification preferences
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) return { ok: false };
    const prefs = JSON.parse(user.notifPrefs) as Record<string, boolean>;
    if (prefs[body.category] === false) return { ok: false, skipped: 'pref-disabled' };
    await prisma.notification.create({
      data: {
        userId: body.userId,
        category: body.category,
        title: body.title,
        body: body.message,
        navScreen: body.navScreen ?? null,
        navParams: JSON.stringify(body.navParams),
      },
    });
    return { ok: true };
  });
}
