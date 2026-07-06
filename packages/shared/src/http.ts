import { upstreamUnavailable } from './errors.js';

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

/** fetch + JSON with timeout and bounded retry (idempotent GETs only by default). */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const {
    headers = {},
    method = 'GET',
    body,
    timeoutMs = 10_000,
    retries = method === 'GET' ? 2 : 0,
  } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = upstreamUnavailable(`Upstream ${new URL(url).host} responded ${res.status}`);
        // backoff before retrying
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw upstreamUnavailable(
          `Upstream ${new URL(url).host} responded ${res.status}: ${text.slice(0, 200)}`,
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if ((err as Error).name === 'AbortError') {
        lastError = upstreamUnavailable(
          `Upstream ${new URL(url).host} timed out after ${timeoutMs}ms`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
