"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";

// Shown instead of a blank or technical error page if something fails while a screen loads. The details stay in the
// server logs; Aryan only needs to know it is not his fault and what to do next.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card stack" role="alert" style={{ maxWidth: 520, margin: "10vh auto 0" }}>
      <div className="row"><Icon name="alert" /><h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1></div>
      <p className="muted">This is a problem on our side, not something you did. Your saved teams and points are safe. Try again; if it keeps happening, wait a minute (the database may be waking up).</p>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>
        <Link href="/" className="btn">Back to Matches</Link>
      </div>
    </div>
  );
}
