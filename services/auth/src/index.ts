import { buildService, startService, getEnv, getCache } from '@monere/shared';
import { prisma } from './db.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerAdminRoutes } from './routes/admin.js';
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
  } catch (err) {
    app.log.warn({ err }, 'cleanup job failed');
  }
}, 3600_000);
cleanup.unref();

await startService(app, 'auth', env.AUTH_PORT);
