"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "../../lib/api/client";
import { ApiError, apiErrorMessage } from "../../lib/api/errors";
import type { CurrentUser } from "../../lib/api/types";

interface SessionContextValue {
  user: CurrentUser;
  logout(): Promise<void>;
  withAccessToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [session, setSession] = useState<{ accessToken: string; user: CurrentUser } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void authApi.refresh()
      .then(async (result) => ({ ...result, user: await authApi.me(result.accessToken) }))
      .then((result) => { if (active) setSession(result); })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) {
          router.replace("/login?reason=expired");
          return;
        }
        setError(apiErrorMessage(reason));
      });
    return () => { active = false; };
  }, [attempt, router]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } finally {
      setSession(null);
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const withAccessToken = useCallback(async <T,>(operation: (accessToken: string) => Promise<T>): Promise<T> => {
    if (session === null) throw new ApiError(401, "SESSION_REQUIRED", "Authentication is required");
    try { return await operation(session.accessToken); } catch (reason: unknown) {
      if (!(reason instanceof ApiError) || reason.status !== 401) throw reason;
      try {
        const refreshed = await authApi.refresh();
        setSession(refreshed);
        return await operation(refreshed.accessToken);
      } catch (refreshError: unknown) {
        setSession(null);
        router.replace("/login?reason=expired");
        throw refreshError;
      }
    }
  }, [router, session]);

  const value = useMemo<SessionContextValue | null>(() => session === null ? null : {
    user: session.user, logout, withAccessToken,
  }, [logout, session, withAccessToken]);

  if (error !== null) return (
    <main className="status-page">
      <p className="error-message" role="alert">{error}</p>
      <button className="button secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
    </main>
  );
  if (value === null) return <main className="status-page"><span className="spinner" aria-hidden="true" /><p>Restoring your session…</p></main>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession must be used inside SessionProvider");
  return session;
}
