import { Suspense } from "react";
import { Icon } from "@/components/icons";

export const metadata = { title: "Enter PIN" };

// Only this small part depends on the visit (?error=1), so it waits inside Suspense
// and the rest of the page can be built ahead of time.
async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return error ? <p className="err" role="alert" id="pin-error">That PIN isn&apos;t right. Try again.</p> : null;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "16dvh 16px 32px" }}>
      <div className="stack-lg">
        <div className="row">
          <span className="brand-mark"><Icon name="bolt" size={16} /></span>
          <strong>Match Day Optimizer</strong>
        </div>
        <div className="page-head">
          <h1>Enter your PIN</h1>
          <p className="muted">This app is private. Ask Aryan for the PIN.</p>
        </div>
        <form method="POST" action="/api/login" className="stack">
          <div className="field">
            <label htmlFor="pin">PIN</label>
            <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus required aria-describedby="pin-error" />
            <Suspense fallback={null}>
              <ErrorMessage searchParams={searchParams} />
            </Suspense>
          </div>
          <button type="submit" className="btn primary">Continue</button>
        </form>
      </div>
    </main>
  );
}
