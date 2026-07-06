/**
 * Background job — evaluates active price alerts against fresh quotes
 * every 30s and notifies the auth service (which stores the notification,
 * respecting the user's preferences). Runs inside the market service so it
 * reuses the quote cache; in a larger deployment this would be its own worker.
 */
import { createLogger, fetchJson, getEnv } from '@monere/shared';
import { getQuotes } from './quotes.js';

const log = createLogger('market-alerts');

interface ActiveAlert {
  id: string;
  userId: string;
  ticker: string;
  direction: 'above' | 'below';
  target: number;
}

function authBase(): string {
  const env = getEnv();
  return env.MONERE_MODE === 'docker'
    ? `http://auth:${env.AUTH_PORT}`
    : `http://localhost:${env.AUTH_PORT}`;
}

export function startAlertsJob(): void {
  const env = getEnv();
  const tick = async () => {
    let alerts: ActiveAlert[];
    try {
      const res = await fetchJson<{ alerts: ActiveAlert[] }>(
        `${authBase()}/internal/alerts/active`,
        {
          headers: { 'x-internal-key': env.INTERNAL_API_KEY },
          timeoutMs: 5000,
          retries: 0,
        },
      );
      alerts = res.alerts;
    } catch {
      return; // auth service momentarily down — retry next tick
    }
    if (alerts.length === 0) return;

    const tickers = [...new Set(alerts.map((a) => a.ticker))];
    let quotes;
    try {
      quotes = await getQuotes(tickers);
    } catch (err) {
      log.warn({ err }, 'alert quote fetch failed');
      return;
    }
    const priceBy = new Map(quotes.map((q) => [q.ticker, q]));

    for (const alert of alerts) {
      const quote = priceBy.get(alert.ticker.toUpperCase());
      if (!quote) continue;
      const hit =
        alert.direction === 'above' ? quote.price >= alert.target : quote.price <= alert.target;
      if (!hit) continue;
      try {
        await fetchJson(`${authBase()}/internal/alerts/${alert.id}/trigger`, {
          method: 'POST',
          headers: { 'x-internal-key': env.INTERNAL_API_KEY },
          body: {
            title: 'Alerte de prix',
            message: `${alert.ticker} a franchi ${alert.direction === 'above' ? 'au-dessus de' : 'en dessous de'} ${alert.target} ${quote.currency ?? ''} (cours actuel : ${quote.price}).`,
            navScreen: 'stock',
            navParams: { ticker: alert.ticker },
          },
          timeoutMs: 5000,
        });
        log.info({ alert: alert.id, ticker: alert.ticker }, 'price alert triggered');
      } catch (err) {
        log.warn({ err, alert: alert.id }, 'alert trigger call failed');
      }
    }
  };
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
}
