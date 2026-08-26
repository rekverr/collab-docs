"use client";

export default function PrivateError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset(): void }>) {
  return (
    <main className="status-page">
      <p className="error-message" role="alert">
        This workspace could not be loaded.
      </p>
      <button className="button secondary" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
