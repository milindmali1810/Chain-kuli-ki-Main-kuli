"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import type { SetupTeam } from "@/lib/liveSetup";
import { saveSetup, type SetupState } from "./actions";

const INITIAL: SetupState = { message: "", errors: {}, values: {} };

export function SetupForm({ cricsheetId, teams }: { cricsheetId: string; teams: SetupTeam[] }) {
  const [state, action, pending] = useActionState(saveSetup, INITIAL);
  const errorIds = Object.keys(state.errors);

  return (
    <form action={action} className="stack-lg" noValidate>
      <input type="hidden" name="match" value={cricsheetId} />
      {state.message && (
        <div role={errorIds.length ? "alert" : "status"} className={errorIds.length ? "banner" : "banner info"}>
          <Icon name={errorIds.length ? "alert" : "check"} />
          <div>
            <p>{state.message}</p>
            {errorIds.length > 0 && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {errorIds.map((id) => <li key={id}>{state.errors[id]}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {teams.map((t) => (
        <section key={t.teamId} className="card stack" aria-labelledby={`team-${t.teamId}`}>
          <h2 id={`team-${t.teamId}`}>{t.name}</h2>
          <p className="muted">
            Players from the last {t.recentMatches} internationals. Type the credit Dream11 shows for each player you might pick.
            After the toss, tick the 11 who are playing.
          </p>
          <div className="stack">
            {t.players.map((p) => {
              const err = state.errors[`cr_${p.id}`];
              return (
                <div className="setup-row" key={p.id}>
                  <label className="setup-xi">
                    <input
                      type="checkbox"
                      name={`xi_${p.id}`}
                      key={`xi-${p.id}-${state.message}`}
                      defaultChecked={state.message ? state.values[`xi_${p.id}`] === "on" : p.inXI}
                    />
                    <span>
                      <strong>{p.name}</strong>
                      <span className="muted"> · {p.added ? "added by you" : `played ${p.played} of ${t.recentMatches}`}</span>
                    </span>
                  </label>
                  <div className="field" style={{ minWidth: 96 }}>
                    <label htmlFor={`cr_${p.id}`} className="sr-only">Credits for {p.name}</label>
                    <input
                      id={`cr_${p.id}`}
                      name={`cr_${p.id}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={p.seededCredit !== null ? `${p.seededCredit} (est.)` : "credits"}
                      defaultValue={state.values[`cr_${p.id}`] ?? p.credit ?? ""}
                      aria-invalid={err ? true : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="field">
            <label htmlFor={`extra_${t.teamId}`}>Add a player who is not listed (optional)</label>
            <input id={`extra_${t.teamId}`} name={`extra_${t.teamId}`} type="text" autoComplete="off" defaultValue={state.values[`extra_${t.teamId}`] ?? ""} aria-describedby={`extra-h-${t.teamId}`} />
            <span className="hint" id={`extra-h-${t.teamId}`}>
              Full name as in the scorecards; separate several with commas. Players you add are treated as playing. They show up here on the next save.
            </span>
          </div>
        </section>
      ))}

      <div className="row">
        <button type="submit" name="intent" value="pick" className="btn primary" disabled={pending}>{pending ? "Working…" : "Save and pick my team"}</button>
        <button type="submit" name="intent" value="save" className="btn" disabled={pending}>Save only</button>
      </div>
      <p className="muted">Players with no credit entered are left out of the pick (shown as &quot;credits unavailable&quot;). Nothing is guessed.</p>
    </form>
  );
}
