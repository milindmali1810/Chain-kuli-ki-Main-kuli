import { Suspense } from "react";

// Only this small part depends on the visit (?error=1), so it waits inside Suspense
// and the rest of the page can be built ahead of time.
async function ErrorMessage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return error ? <p role="alert">Wrong PIN. Try again.</p> : null;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main style={{ maxWidth: 320, margin: "20vh auto", padding: 16 }}>
      <h1>Match Day Optimizer</h1>
      <p>Enter the PIN to continue.</p>
      <form method="POST" action="/api/login">
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button type="submit" style={{ padding: "8px 16px" }}>
          Enter
        </button>
      </form>
      <Suspense>
        <ErrorMessage searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
