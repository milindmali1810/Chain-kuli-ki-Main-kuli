import Link from "next/link";
import { Icon } from "@/components/icons";
import { ACTORS, COLUMNS } from "@/lib/componentsMap";

export const metadata = { title: "Components map" };

export default function ComponentsMapPage() {
  return (
    <div className="stack-lg">
      <div className="stack">
        <Link href="/guide" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />Guide</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Components map</h1>
          <p className="muted">Who does what, from the trigger to the output. Rows are the actors; columns follow the flow.</p>
        </div>
      </div>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p>The AI column has one real entry: Gemini Flash writes explanation text. Everything that decides a team, checks a rule or scores a player is plain code.</p>
      </div>

      <div className="tablewrap" role="region" aria-label="Components map table" tabIndex={0}>
        <table style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th scope="col" style={{ minWidth: 180 }}>Actor</th>
              {COLUMNS.map((c) => <th key={c} scope="col" style={{ minWidth: 190 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {ACTORS.map((a) => (
              <tr key={a.name}>
                <th scope="row" style={{ verticalAlign: "top", whiteSpace: "normal" }}>
                  <div>{a.name}</div>
                  <div className="muted" style={{ fontWeight: 400 }}>{a.kind}</div>
                </th>
                {COLUMNS.map((c) => (
                  <td key={c} style={{ verticalAlign: "top", whiteSpace: "normal", lineHeight: 1.45 }}>{a.cells[c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">On a phone, scroll the table sideways inside its box.</p>
    </div>
  );
}
