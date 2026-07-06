/**
 * API client — every call goes through the gateway (/api/*).
 * Access token in memory, refresh token in localStorage; automatic
 * refresh-and-retry on 401 (rotation handled server-side).
 */

const REFRESH_KEY = 'monere_refresh';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}
export function setRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* storage unavailable (private mode) — session-only auth */
  }
}
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function rawRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { error?: string }).error ?? 'ERROR',
      (data as { message?: string }).message ?? `Erreur ${res.status}`,
      data,
    );
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  const rt = getRefreshToken();
  if (!rt) return false;
  refreshing = (async () => {
    try {
      const data = await rawRequest<{ accessToken: string; refreshToken: string }>(
        '/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken: rt }),
        },
      );
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      return true;
    } catch {
      setAccessToken(null);
      setRefreshToken(null);
      onSessionExpired?.();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith('/auth/')) {
      if (await tryRefresh()) return rawRequest<T>(path, options);
    }
    throw err;
  }
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** SSE stream of real-time quotes (EventSource can't set headers → token in query). */
export function openQuoteStream(symbols: string[], onQuote: (q: unknown) => void): () => void {
  if (!accessToken || symbols.length === 0) return () => undefined;
  const url = `/api/market/stream?symbols=${encodeURIComponent(symbols.join(','))}&token=${encodeURIComponent(accessToken)}`;
  const es = new EventSource(url);
  es.addEventListener('quote', (e) => {
    try {
      onQuote(JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore malformed frame */
    }
  });
  return () => es.close();
}
