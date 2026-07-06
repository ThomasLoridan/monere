/**
 * Real-time distribution hub.
 *  - Finnhub websocket (when key present): US trades pushed within ~1s.
 *  - Poll loop every 15s for every symbol any client watches (US + EU),
 *    guaranteeing the ≤30s freshness target end-to-end.
 * Clients subscribe via SSE: GET /market/stream?symbols=AAPL,MC
 */
import WebSocket from 'ws';
import { createLogger, getEnv } from '@monere/shared';
import { getQuotes, type Quote } from './quotes.js';
import { toFinnhubSymbol, resolveStock, isRealtimeSymbol } from './universe.js';

const log = createLogger('market-stream');

type Client = {
  id: number;
  symbols: Set<string>; // canonical tickers
  send: (event: string, data: unknown) => void;
};

const clients = new Map<number, Client>();
let nextClientId = 1;
let pollTimer: NodeJS.Timeout | undefined;
let fhSocket: WebSocket | undefined;
const fhSubscribed = new Set<string>();

export function addClient(symbols: string[], send: Client['send']): () => void {
  const id = nextClientId++;
  const client: Client = { id, symbols: new Set(symbols.map((s) => s.toUpperCase())), send };
  clients.set(id, client);
  syncFinnhubSubscriptions();
  ensurePolling();
  // Push a first snapshot immediately so the UI paints without waiting a tick
  void getQuotes([...client.symbols]).then((quotes) => {
    for (const q of quotes) send('quote', q);
  });
  return () => {
    clients.delete(id);
    syncFinnhubSubscriptions();
    if (clients.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
}

function watchedTickers(): Set<string> {
  const all = new Set<string>();
  for (const c of clients.values()) for (const s of c.symbols) all.add(s);
  return all;
}

function broadcast(quote: Quote): void {
  for (const c of clients.values()) {
    if (c.symbols.has(quote.ticker) || c.symbols.has(quote.symbol)) c.send('quote', quote);
  }
}

function ensurePolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    const tickers = [...watchedTickers()];
    if (tickers.length === 0) return;
    try {
      const quotes = await getQuotes(tickers);
      for (const q of quotes) broadcast(q);
    } catch (err) {
      log.warn({ err }, 'poll loop failed');
    }
  }, 15_000);
  pollTimer.unref();
}

// ── Finnhub websocket: sub-second US trade prints ───────────
export function startFinnhubSocket(): void {
  const key = getEnv().FINNHUB_API_KEY;
  if (!key) {
    log.info('FINNHUB_API_KEY absent — flux websocket désactivé, polling 15s uniquement');
    return;
  }
  const connect = () => {
    fhSocket = new WebSocket(`wss://ws.finnhub.io?token=${key}`);
    fhSocket.on('open', () => {
      log.info('finnhub websocket connected');
      fhSubscribed.clear();
      syncFinnhubSubscriptions();
    });
    fhSocket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type: string;
          data?: Array<{ s: string; p: number; t: number }>;
        };
        if (msg.type !== 'trade' || !msg.data) return;
        // Keep the most recent print per symbol in this frame
        const latest = new Map<string, { p: number; t: number }>();
        for (const d of msg.data) latest.set(d.s, { p: d.p, t: d.t });
        for (const [sym, { p, t }] of latest) {
          const meta = resolveStock(sym);
          broadcast({
            ticker: meta?.ticker ?? sym,
            symbol: sym,
            name: meta?.name ?? null,
            currency: meta?.currency ?? 'USD',
            price: p,
            change: null, // trade prints carry price only; the 15s poll fills change/pct
            changePct: null,
            previousClose: null,
            marketTime: Math.floor(t / 1000),
            delayed: false,
            provider: 'finnhub-ws',
            source: { name: 'Finnhub', url: `https://finnhub.io/quote/${sym}` },
            fetchedAt: Date.now(),
          });
        }
      } catch {
        /* ignore malformed frames */
      }
    });
    fhSocket.on('close', () => {
      log.warn('finnhub websocket closed — reconnecting in 5s');
      setTimeout(connect, 5000).unref();
    });
    fhSocket.on('error', (err) => log.warn({ err }, 'finnhub websocket error'));
  };
  connect();
}

function syncFinnhubSubscriptions(): void {
  if (!fhSocket || fhSocket.readyState !== WebSocket.OPEN) return;
  const wanted = new Set(
    [...watchedTickers()].filter((t) => isRealtimeSymbol(t)).map((t) => toFinnhubSymbol(t)),
  );
  for (const sym of wanted) {
    if (!fhSubscribed.has(sym)) {
      fhSocket.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      fhSubscribed.add(sym);
    }
  }
  for (const sym of fhSubscribed) {
    if (!wanted.has(sym)) {
      fhSocket.send(JSON.stringify({ type: 'unsubscribe', symbol: sym }));
      fhSubscribed.delete(sym);
    }
  }
}
