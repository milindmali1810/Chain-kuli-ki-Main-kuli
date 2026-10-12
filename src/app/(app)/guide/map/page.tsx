import Link from "next/link";
import { Icon } from "@/components/icons";
import { MapDiagram } from "@/components/MapDiagram";
import { ACTORS, COLUMNS } from "@/lib/componentsMap";
import { AFTER_MATCH, BEFORE_MATCH } from "@/lib/mapDiagram";

export const metadata = { title: "Components map" };

// The picture first (who does what, from trigger to output), then one tap-to-open card per part for the detail.
export default function ComponentsMapPage() {
  return (
    <div className="stack-lg">
      <div className="stack">
        <Link href="/guide" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />Guide</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Components map</h1>
          <p className="muted">Who does what, from the trigger to the output.</p>
        </div>
      </div>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p>Only one part uses AI: Gemini Flash writes the reasons. Everything that decides a team, checks a rule or scores a player is plain code.</p>
      </div>

      {[BEFORE_MATCH, AFTER_MATCH].map((flow, i) => (
        <section key={flow.title} className="card stack" aria-labelledby={`flow-${i}`}>
          <div>
            <h2 id={`flow-${i}`}>{flow.title}</h2>
            <p className="muted">{flow.subtitle}</p>
          </div>
          <div className="diagram"><MapDiagram flow={flow} id={`flow${i}`} /></div>
        </section>
      ))}
      <p className="muted">On a phone, scroll each picture sideways. The same pictures are saved as <code>docs/components-map.svg</code> for reports and slides.</p>

      <h2>Every part in detail</h2>
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
