"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { authApi } from "../../lib/api/client";
import { ApiError, apiErrorMessage } from "../../lib/api/errors";
import type { CurrentUser } from "../../lib/api/types";

interface SessionContextValue {
  user: CurrentUser | null;
  error: string | null;
  ready: boolean;
  logout(): Promise<void>;
  retry(): void;
  withAccessToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<{ accessToken: string; user: CurrentUser } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void authApi
      .refresh()
      .then(async (result) => ({
        ...result,
        user: await authApi.persistAccessSession(result.accessToken),
      }))
      .then((result) => {
        if (active) {
          setSession(result);
          router.refresh();
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) {
          router.replace(expiredSessionPath(pathname));
          return;
        }
        setError(apiErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [attempt, pathname, router]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setSession(null);
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const withAccessToken = useCallback(
    async <T,>(operation: (accessToken: string) => Promise<T>): Promise<T> => {
      if (session === null)
        throw new ApiError(401, "SESSION_REQUIRED", "Authentication is required");
      try {
        return await operation(session.accessToken);
      } catch (reason: unknown) {
        if (!(reason instanceof ApiError) || reason.status !== 401) throw reason;
        try {
          const refreshed = await authApi.refresh();
          const user = await authApi.persistAccessSession(refreshed.accessToken);
          setSession({ ...refreshed, user });
          return await operation(refreshed.accessToken);
        } catch (refreshError: unknown) {
          setSession(null);
          router.replace(expiredSessionPath(pathname));
          throw refreshError;
        }
      }
    },
    [pathname, router, session],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      user: session?.user ?? null,
      error,
      ready: session !== null,
      logout,
      retry,
      withAccessToken,
    }),
    [error, logout, retry, session, withAccessToken],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function expiredSessionPath(pathname: string): string {
  const next = pathname.startsWith("/app") || pathname.startsWith("/share/") ? pathname : "/app";
  return `/login?reason=expired&next=${encodeURIComponent(next)}`;
}

export function SessionGate({ children }: Readonly<{ children: ReactNode }>) {
  const session = useSessionState();
  if (session.error !== null) {
    return (
      <div className="status-page">
        <p className="error-message" role="alert">
          {session.error}
        </p>
        <button className="button secondary" type="button" onClick={session.retry}>
          Try again
        </button>
      </div>
    );
  }
  if (!session.ready) {
    return (
      <div className="status-page">
        <span className="spinner" aria-hidden="true" />
        <p>Restoring your session…</p>
      </div>
    );
  }
  return children;
}

export function useSessionState(): SessionContextValue {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession must be used inside SessionProvider");
  return session;
}

export function useSession(): SessionContextValue & { user: CurrentUser } {
  const session = useSessionState();
  const authenticatedSession = useMemo(() => {
    if (session.user === null) return null;
    return { ...session, user: session.user };
  }, [session]);
  if (authenticatedSession === null) {
    throw new Error("useSession must be rendered inside SessionGate");
  }
  return authenticatedSession;
}
