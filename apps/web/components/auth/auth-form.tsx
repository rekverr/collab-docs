"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";

export function AuthForm({ mode }: Readonly<{ mode: "login" | "register" }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const displayName = String(data.get("displayName") ?? "").trim();
    try {
      if (isRegister) await authApi.register({ email, password, ...(displayName === "" ? {} : { displayName }) });
      else await authApi.login({ email, password });
      const nextPath = searchParams.get("next");
      router.replace(nextPath?.startsWith("/app") ? nextPath : "/app");
      router.refresh();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="brand" href="/">Collab Docs</Link>
        <p className="eyebrow">{isRegister ? "Create an account" : "Welcome back"}</p>
        <h1 id="auth-title">{isRegister ? "Start your workspace" : "Sign in"}</h1>
        <p className="muted">{isRegister ? "Organize knowledge with your team." : "Continue to your collaborative workspace."}</p>
        {searchParams.get("reason") === "expired" && <p className="notice" role="status">Your session expired. Sign in to continue.</p>}
        <form onSubmit={submit} className="form-stack">
          {isRegister && <label>Display name <input name="displayName" maxLength={120} autoComplete="name" /></label>}
          <label>Email <input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
          <label>Password <input name="password" type="password" required minLength={isRegister ? 12 : 1} maxLength={128} autoComplete={isRegister ? "new-password" : "current-password"} pattern={isRegister ? "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" : undefined} /></label>
          {isRegister && <p className="field-help">12–128 characters with upper-case, lower-case, and a number.</p>}
          {error !== null && <p className="error-message" role="alert">{error}</p>}
          <button className="button" disabled={pending} type="submit">{pending ? "Please wait…" : isRegister ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Collab Docs?"} <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Register"}</Link></p>
      </section>
    </main>
  );
}
