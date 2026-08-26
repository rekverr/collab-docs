import { Suspense } from "react";
import { AuthForm } from "../../../components/auth/auth-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="status-page">Loading…</main>}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
