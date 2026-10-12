import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card stack" style={{ maxWidth: 520, margin: "10vh auto 0" }}>
      <h1 style={{ fontSize: "1.25rem" }}>We can&apos;t find that page</h1>
      <p className="muted">The match or page may have been removed, or the link is wrong.</p>
      <div className="row"><Link href="/" className="btn primary">Back to Matches</Link></div>
    </div>
  );
}
