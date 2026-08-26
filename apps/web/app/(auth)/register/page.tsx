import { Suspense } from "react";
import { AuthForm } from "../../../components/auth/auth-form";

export default function RegisterPage() {
  return <Suspense fallback={<main className="status-page">Loading…</main>}><AuthForm mode="register" /></Suspense>;
}
