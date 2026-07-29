import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getRuntimeConfig } from './config';
import { fetchCurrentUser, type User } from '../lib/api/users';
import { canUseAdminUi, roleFromLevel, type UserRole } from '../lib/roles';
import { clearStoredOAuthToken } from '../lib/auth/tokenStore';
import { HaveApiError, isExpiredSessionError, SESSION_EXPIRED_EVENT } from '../lib/api/haveapi';
import { markSessionExpiredNotice } from '../lib/auth/sessionExpiredNotice';
import { hardReplace } from '../lib/browserNavigation';
import { withRouterBasename } from '../lib/routerPaths';

export type AuthStatus = 'anonymous' | 'expired' | 'loading' | 'authenticated' | 'forbidden' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user?: User;
  role: UserRole;
  canUseAdminUi: boolean;
  error?: unknown;
  loginUrl: string;
  logoutUrl: string;
  sessionExpiresAt?: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function buildLoginUrl(base: string | undefined, nextPath: string): string {
  const root = base ?? '';
  const normalized = root.endsWith('/') ? root.slice(0, -1) : root;
  return `${normalized}/?page=login&next=${encodeURIComponent(nextPath)}`;
}

function buildLogoutUrl(base: string | undefined, nextPath: string): string {
  const root = base ?? '';
  const normalized = root.endsWith('/') ? root.slice(0, -1) : root;
  return `${normalized}/?page=logout&next=${encodeURIComponent(nextPath)}`;
}

function buildEndpointUrl(
  explicitUrl: string | undefined,
  fallbackUrl: string,
  nextPath: string
): string {
  if (!explicitUrl) return fallbackUrl;

  // If the explicit URL is same-origin, we can safely append `next=` so the backend can
  // redirect the user back after login/logout. For cross-origin URLs (e.g. direct auth server
  // authorize endpoint), we do not mutate the query string.
  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const u = new URL(explicitUrl, baseOrigin);

    if (u.origin === baseOrigin && !u.searchParams.has('next')) {
      u.searchParams.set('next', nextPath);
    }

    return u.toString();
  } catch {
    return explicitUrl;
  }
}

function sessionExpiredRedirectPath(routerBasename: string): string {
  return withRouterBasename('/?session=expired', routerBasename);
}

export function AuthProvider(props: {
  children: React.ReactNode;
  nextPath: string;
  redirectExpiredSessions?: boolean;
}) {
  const cfg = getRuntimeConfig();
  const [sessionExpired, setSessionExpired] = useState(false);
  const redirectExpiredSessions = props.redirectExpiredSessions ?? true;

  const enabled = cfg.auth.kind !== 'none';

  const expireSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    const currentCfg = getRuntimeConfig();
    clearStoredOAuthToken(currentCfg.oauth2.storage);

    if (window.vpsAdmin) {
      window.vpsAdmin.accessToken = undefined;
      window.vpsAdmin.sessionToken = undefined;
    }

    if (!redirectExpiredSessions) {
      setSessionExpired(false);
      return;
    }

    setSessionExpired(true);
    markSessionExpiredNotice();

    const target = sessionExpiredRedirectPath(currentCfg.routerBasename);
    const current = window.location.pathname + window.location.search;
    if (current !== target) {
      hardReplace(target);
    }
  }, [redirectExpiredSessions]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const onSessionExpired = () => expireSession();
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [enabled, expireSession]);

  const q = useQuery({
    queryKey: ['user', 'current'],
    queryFn: async () => (await fetchCurrentUser()).data,
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isExpiredSessionError(q.error)) return;
    expireSession();
  }, [expireSession, q.error]);

  const baseUrl = cfg.webuiUrl ?? (typeof window !== 'undefined' ? window.location.origin : undefined);

  const loginUrl = buildEndpointUrl(
    cfg.loginUrl,
    buildLoginUrl(baseUrl, props.nextPath),
    props.nextPath
  );
  // Logout must always land on the public overview. Returning to the current
  // protected route would immediately render a "login required" screen.
  const logoutNextPath = withRouterBasename('/', cfg.routerBasename);
  const logoutUrl = buildEndpointUrl(
    cfg.logoutUrl,
    buildLogoutUrl(baseUrl, logoutNextPath),
    logoutNextPath
  );

  const value: AuthContextValue = useMemo(() => {
    if (sessionExpired) {
      return {
        status: 'expired',
        user: undefined,
        role: 'unknown',
        canUseAdminUi: false,
        error: undefined,
        loginUrl,
        logoutUrl,
        sessionExpiresAt: cfg.sessionExpiresAt,
      };
    }

    if (!enabled) {
      return {
        status: 'anonymous',
        user: undefined,
        role: 'unknown',
        canUseAdminUi: false,
        loginUrl,
        logoutUrl,
        sessionExpiresAt: cfg.sessionExpiresAt,
      };
    }

    if (q.isLoading) {
      return {
        status: 'loading',
        user: undefined,
        role: 'unknown',
        canUseAdminUi: false,
        loginUrl,
        logoutUrl,
        sessionExpiresAt: cfg.sessionExpiresAt,
      };
    }

    if (q.isError || !q.data) {
      const err = q.error;

      // Most common case: not signed in (or token expired) -> show a clean re-login state.
      // We rely on HTTP status which is surfaced on HaveApiError.
      if (err instanceof HaveApiError) {
        if (isExpiredSessionError(err)) {
          if (!redirectExpiredSessions) {
            return {
              status: 'anonymous',
              user: undefined,
              role: 'unknown',
              canUseAdminUi: false,
              loginUrl,
              logoutUrl,
              sessionExpiresAt: cfg.sessionExpiresAt,
            };
          }

          return {
            status: 'expired',
            user: undefined,
            role: 'unknown',
            canUseAdminUi: false,
            error: undefined,
            loginUrl,
            logoutUrl,
            sessionExpiresAt: cfg.sessionExpiresAt,
          };
        }

        if (err.httpStatus === 403) {
          return {
            status: 'forbidden',
            user: undefined,
            role: 'unknown',
            canUseAdminUi: false,
            error: err,
            loginUrl,
            logoutUrl,
            sessionExpiresAt: cfg.sessionExpiresAt,
          };
        }
      }

      return {
        status: 'error',
        user: undefined,
        role: 'unknown',
        canUseAdminUi: false,
        error: err,
        loginUrl,
        logoutUrl,
        sessionExpiresAt: cfg.sessionExpiresAt,
      };
    }

    const role = roleFromLevel(q.data.level);

    return {
      status: 'authenticated',
      user: q.data,
      role,
      canUseAdminUi: canUseAdminUi(role),
      loginUrl,
      logoutUrl,
      sessionExpiresAt: cfg.sessionExpiresAt,
    };
  }, [cfg.sessionExpiresAt, enabled, q.isLoading, q.isError, q.data, q.error, sessionExpired, loginUrl, logoutUrl, redirectExpiredSessions]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
