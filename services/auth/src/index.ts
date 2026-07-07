import { buildService, startService, getEnv, getCache } from '@monere/shared';
import { prisma } from './db.js';
import { sendEarningsReminderEmail } from './email.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerAdminRoutes } from './routes/admin.js';
import { processExternalNotifications } from './notifier.js';
import { registerInternalRoutes } from './routes/internal.js';

const env = getEnv();
await getCache(); // establishes redis connection when in docker mode (rate limiter store)

const app = await buildService({ name: 'auth', port: env.AUTH_PORT });

await app.register(registerAuthRoutes);
await app.register(registerMeRoutes);
await app.register(registerAdminRoutes);
await app.register(registerInternalRoutes);

// Hourly cleanup: expired codes + expired/revoked refresh tokens
const cleanup = setInterval(async () => {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  try {
    await prisma.verificationCode.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    await prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
    });
    // Earnings alerts whose event is long past (kept 30 days for history)
    await prisma.earningsAlert.deleteMany({
      where: { eventDate: { lt: new Date(Date.now() - 30 * 86_400_000) } },
    });
  } catch (err) {
    app.log.warn({ err }, 'cleanup job failed');
  }
}, 3600_000);
cleanup.unref();

// ── Rappels earnings : e-mail + notification in-app à J-7 ────
// L'e-mail part une seule fois (sentAt) ; s'il échoue (ex. adresse de test non
// vérifiée côté Resend), l'alerte est quand même marquée envoyée pour éviter
// une boucle de spam — la notification in-app, elle, est toujours créée.
async function processEarningsReminders(): Promise<void> {
  const due = await prisma.earningsAlert.findMany({
    where: { sentAt: null, notifyAt: { lte: new Date() }, eventDate: { gte: new Date() } },
    include: { user: true },
    take: 100,
  });
  for (const alert of due) {
    const dateISO = alert.eventDate.toISOString().slice(0, 10);
    const dateFr = alert.eventDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    try {
      await prisma.notification.create({
        data: {
          userId: alert.userId,
          category: 'earnings',
          title: `${alert.ticker} publie dans 1 semaine`,
          body: `Résultats${alert.quarter ? ` ${alert.quarter}` : ''} attendus le ${dateFr}. Consultez le consensus et l'historique dans l'app.`,
          navScreen: 'earnings',
          navParams: JSON.stringify({ ticker: alert.ticker }),
        },
      });
      const prefs = JSON.parse(alert.user.notifPrefs) as Record<string, boolean>;
      if (prefs.earnings !== false && !alert.user.disabled) {
        await sendEarningsReminderEmail(alert.user.email, {
          ticker: alert.ticker,
          dateISO,
          quarter: alert.quarter || undefined,
        }).catch((err) =>
          app.log.error({ err, ticker: alert.ticker }, 'earnings reminder email failed'),
        );
      }
      await prisma.earningsAlert.update({
        where: { id: alert.id },
        data: { sentAt: new Date() },
      });
      app.log.info({ ticker: alert.ticker, userId: alert.userId }, 'earnings reminder processed');
    } catch (err) {
      app.log.error({ err, alertId: alert.id }, 'earnings reminder failed');
    }
  }
}
processEarningsReminders().catch((err) =>
  app.log.warn({ err }, 'earnings reminders initial run failed'),
);
const reminders = setInterval(
  () =>
    processEarningsReminders().catch((err) => app.log.warn({ err }, 'earnings reminders failed')),
  15 * 60_000,
);
reminders.unref();

// ── Notifications smart money + actualités (toutes les 10 min) ──
processExternalNotifications().catch((err) =>
  app.log.warn({ err }, 'external notifications initial run failed'),
);
const extNotifs = setInterval(
  () =>
    processExternalNotifications().catch((err) =>
      app.log.warn({ err }, 'external notifications failed'),
    ),
  10 * 60_000,
);
extNotifs.unref();

await startService(app, 'auth', env.AUTH_PORT);
