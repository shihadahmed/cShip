'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ensureCsrfToken,
  fetchJson,
  fetchMe,
  getApiBaseUrl,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMe();
      setUser(data?.user ?? null);
      setSessionExpired(false);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore the session on mount. The session cookie is HttpOnly, so the only
  // way to know whether it is still valid is to ask the API.
  useEffect(() => {
    refresh();
    ensureCsrfToken().catch(() => {});
  }, [refresh]);

  // Any API call that returns 401 drops the local auth state and sends the
  // user back to the login page.
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener('cship:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('cship:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') {
      router.replace(sessionExpired ? '/login?error=session_expired' : '/login');
    }
  }, [loading, user, pathname, sessionExpired, router]);

  const login = () => {
    window.location.href = `${getApiBaseUrl()}/api/auth/github`;
  };

  const logout = async () => {
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout failures: local state is cleared regardless.
    }
    setUser(null);
    router.replace('/login');
  };

  // Do not render protected content while the session is unknown or missing.
  if (loading || !user) {
    return <div className="flex h-screen items-center justify-center">Loading…</div>;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { fetchMe, getCsrfToken, setCsrfToken } from './api';
