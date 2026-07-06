import React from 'react';
import {
  post,
  get,
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  setSessionExpiredHandler,
} from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ verificationRequired?: boolean; devCode?: string }>;
  signup: (email: string, password: string) => Promise<{ devCode?: string; emailSent: boolean }>;
  verify: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<{ devCode?: string }>;
  requestReset: (email: string) => Promise<{ devCode?: string }>;
  confirmReset: (email: string, code: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setPremium: (subscribe: boolean) => Promise<void>;
  updateNotifPrefs: (prefs: Record<string, boolean>) => Promise<void>;
}

const AuthContext = React.createContext<AuthState | null>(null);

interface TokenResponse {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: User;
  verificationRequired?: boolean;
  devCode?: string;
  emailSent?: boolean;
  message?: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const applySession = React.useCallback((data: TokenResponse) => {
    if (data.accessToken) setAccessToken(data.accessToken);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    if (data.user) setUser(data.user);
  }, []);

  // Session restore on boot: refresh token → access token → profile
  React.useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    (async () => {
      try {
        const rt = getRefreshToken();
        if (rt) {
          const data = await post<TokenResponse>('/auth/refresh', { refreshToken: rt });
          applySession(data);
          const me = await get<{ user: User }>('/me');
          setUser(me.user);
        }
      } catch {
        setRefreshToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [applySession]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const data = await post<TokenResponse>('/auth/login', { email, password });
      if (data.verificationRequired) return { verificationRequired: true, devCode: data.devCode };
      applySession(data);
      return {};
    },
    [applySession],
  );

  const signup = React.useCallback(async (email: string, password: string) => {
    const data = await post<TokenResponse>('/auth/signup', { email, password });
    return { devCode: data.devCode, emailSent: Boolean(data.emailSent) };
  }, []);

  const verify = React.useCallback(
    async (email: string, code: string) => {
      const data = await post<TokenResponse>('/auth/verify', { email, code });
      applySession(data);
    },
    [applySession],
  );

  const resendCode = React.useCallback(async (email: string) => {
    const data = await post<TokenResponse>('/auth/resend', { email });
    return { devCode: data.devCode };
  }, []);

  const requestReset = React.useCallback(async (email: string) => {
    const data = await post<TokenResponse>('/auth/password-reset/request', { email });
    return { devCode: data.devCode };
  }, []);

  const confirmReset = React.useCallback(
    async (email: string, code: string, newPassword: string) => {
      await post('/auth/password-reset/confirm', { email, code, newPassword });
    },
    [],
  );

  const logout = React.useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) await post('/auth/logout', { refreshToken: rt }).catch(() => undefined);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  const refreshUser = React.useCallback(async () => {
    const me = await get<{ user: User }>('/me');
    setUser(me.user);
  }, []);

  const setPremium = React.useCallback(async (subscribe: boolean) => {
    const res = await post<{ user: User }>('/me/premium', { subscribe });
    setUser(res.user);
  }, []);

  const updateNotifPrefs = React.useCallback(async (prefs: Record<string, boolean>) => {
    const res = await patchMe(prefs);
    setUser(res.user);
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      verify,
      resendCode,
      requestReset,
      confirmReset,
      logout,
      refreshUser,
      setPremium,
      updateNotifPrefs,
    }),
    [
      user,
      loading,
      login,
      signup,
      verify,
      resendCode,
      requestReset,
      confirmReset,
      logout,
      refreshUser,
      setPremium,
      updateNotifPrefs,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function patchMe(notifPrefs: Record<string, boolean>): Promise<{ user: User }> {
  const { patch } = await import('../lib/api');
  return patch<{ user: User }>('/me', { notifPrefs });
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
