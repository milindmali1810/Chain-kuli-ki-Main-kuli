import Link from "next/link";
import { Icon } from "@/components/icons";
import { ACTORS, COLUMNS } from "@/lib/componentsMap";

export const metadata = { title: "Components map" };

// One tap-to-open card per part of the system, instead of a wide table that scrolls sideways.
export default function ComponentsMapPage() {
  return (
    <div className="stack-lg">
      <div className="stack">
        <Link href="/guide" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />Guide</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Components map</h1>
          <p className="muted">Who does what, from the trigger to the output. Tap a part to open it.</p>
        </div>
      </div>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p>Only one part uses AI: Gemini Flash writes explanation text. Everything that decides a team, checks a rule or scores a player is plain code.</p>
      </div>

      <div className="stack">
        {ACTORS.map((a) => (
          <details key={a.name} className="more">
            <summary>
              <span>{a.name} <span className="muted" style={{ fontWeight: 400 }}>· {a.kind}</span></span>
            </summary>
            <div className="body">
              <dl className="stack" style={{ margin: 0 }}>
                {COLUMNS.map((c) => (
                  <div key={c}>
                    <dt className="muted" style={{ fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{c}</dt>
                    <dd style={{ margin: "2px 0 0" }}>{a.cells[c]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
