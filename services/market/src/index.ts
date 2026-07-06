import { buildService, startService, getEnv, getCache } from '@monere/shared';
import { registerMarketRoutes } from './routes.js';
import { registerInternalMarketRoutes } from './routes-internal.js';
import { startFinnhubSocket } from './stream.js';
import { startAlertsJob } from './alerts-job.js';

const env = getEnv();
await getCache();

const app = await buildService({ name: 'market', port: env.MARKET_PORT, rateLimitMax: 300 });
await app.register(registerMarketRoutes);
await app.register(registerInternalMarketRoutes);

startFinnhubSocket();
startAlertsJob();

await startService(app, 'market', env.MARKET_PORT);
