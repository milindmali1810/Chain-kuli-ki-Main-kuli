import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { ROLE_LABEL } from "@/lib/format";
import { serverDb } from "@/lib/db";
import { removeRoleOverride, saveRoleOverride } from "./actions";

export const metadata = { title: "Data" };

interface Left { playerId: number; name: string; reasons: Set<string>; matches: number }

async function DataView() {
  await connection(); // read live data per visit; never run this while the app is being built
  const db = serverDb();
  const [{ data: recs }, { data: overrides }] = await Promise.all([
    db.from("recommendations").select("match_id, engine_notes_json"),
    db.from("manual_overrides").select("entity_id, value, updated_at").eq("entity_type", "player").eq("field", "role"),
  ]);

  // Players the model had to leave out for missing data, across all matches.
  const left = new Map<number, Left>();
  const seen = new Set<string>();
  for (const r of recs ?? []) {
    for (const e of (r.engine_notes_json?.excluded ?? []) as { playerId: number; name: string; reason: string }[]) {
      const l = left.get(e.playerId) ?? { playerId: e.playerId, name: e.name, reasons: new Set<string>(), matches: 0 };
      l.reasons.add(e.reason);
      if (!seen.has(`${r.match_id}:${e.playerId}`)) { seen.add(`${r.match_id}:${e.playerId}`); l.matches += 1; }
      left.set(e.playerId, l);
    }
  }
  const overrideIds = (overrides ?? []).map((o) => o.entity_id);
  const names = new Map<number, string>();
  if (overrideIds.length) {
    const { data: ps } = await db.from("players").select("id, name").in("id", overrideIds);
    for (const p of ps ?? []) names.set(p.id, p.name);
  }
  const overrideOf = new Map((overrides ?? []).map((o) => [o.entity_id, o.value as string]));
  const rows = [...left.values()].filter((l) => !overrideOf.has(l.playerId)).sort((a, b) => b.matches - a.matches).slice(0, 40);

  return (
    <div className="stack-lg">
      <section className="stack" aria-labelledby="left-h">
        <h2 id="left-h">Players left out for missing data</h2>
        <p className="muted">
          The agent never guesses a role. If a player has too little recent history, he is left out and listed here. Give him a role and he is
          included the next time that match is predicted.
        </p>
        {rows.length === 0 ? (
          <div className="card empty"><h3>Nobody is waiting</h3><p className="muted">Every player in the stored matches had enough data.</p></div>
        ) : (
          <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((l) => (
              <li key={l.playerId} className="player" style={{ padding: "var(--s3) var(--s4)" }}>
                <form action={saveRoleOverride} className="row-between" style={{ gap: "var(--s3)" }}>
                  <input type="hidden" name="playerId" value={l.playerId} />
                  <div className="who">
                    <span className="name">{l.name}</span>
                    <span className="meta">{[...l.reasons].join("; ")} · in {l.matches} match{l.matches === 1 ? "" : "es"}</span>
                  </div>
                  <div className="row">
                    <label className="sr-only" htmlFor={`role_${l.playerId}`}>Role for {l.name}</label>
                    <select id={`role_${l.playerId}`} name="role" defaultValue="" required style={{ minHeight: 44, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "inherit" }}>
                      <option value="" disabled>Choose a role</option>
                      {Object.entries(ROLE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    <button type="submit" className="btn">Save role</button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="manual-h">
        <h2 id="manual-h">Roles you set by hand</h2>
        {(overrides ?? []).length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {(overrides ?? []).map((o) => (
              <li key={o.entity_id} className="player" style={{ padding: "var(--s3) var(--s4)" }}>
                <form action={removeRoleOverride} className="row-between">
                  <input type="hidden" name="playerId" value={o.entity_id} />
                  <span><strong>{names.get(o.entity_id) ?? `Player ${o.entity_id}`}</strong> · {ROLE_LABEL[o.value as string] ?? o.value}</span>
                  <button type="submit" className="btn">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p>Manual values always win over values the agent worked out. They apply the next time a match is predicted (run the backtest for that match again).</p>
      </div>
    </div>
  );
}

export default function DataPage() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Data</h1>
        <p className="muted">Fill gaps the agent will not guess. Your values override anything it worked out.</p>
      </div>
      <Suspense fallback={<div className="stack-lg" aria-busy="true"><div className="skeleton" /><div className="skeleton" /></div>}>
        <DataView />
      </Suspense>
    </div>
  );
}
