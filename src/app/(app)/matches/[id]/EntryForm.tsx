"use client";

import { useActionState, useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { saveActualPoints, type SaveState } from "./actions";

interface Entry {
  playerId: number;
  name: string;
  current: number | null; // what is stored or calculated now (a typed Dream11 value, or the scorecard calculation)
}

const INITIAL: SaveState = { ok: false, message: "", errors: {} };

export function EntryForm({
  cricsheetId,
  entries,
  source,
  reportedTotal,
  teamLabel,
}: {
  cricsheetId: string;
  entries: Entry[];
  source: string | null;
  reportedTotal: number | null;
  teamLabel: string;
}) {
  const [state, action, pending] = useActionState(saveActualPoints, INITIAL);
  const summary = useRef<HTMLDivElement>(null);

  // After a failed save, move focus to the summary so keyboard and screen-reader users hear what to fix.
  useEffect(() => {
    if (state.message && !state.ok) summary.current?.focus();
  }, [state]);

  const errorIds = Object.keys(state.errors);
  const labelOf = (id: string) => (id === "total" ? "Team total" : entries.find((e) => String(e.playerId) === id)?.name);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="match" value={cricsheetId} />

      {state.message && (
        <div ref={summary} tabIndex={-1} role={state.ok ? "status" : "alert"} className={state.ok ? "banner info" : "banner"}>
          <Icon name={state.ok ? "check" : "alert"} />
          <div>
            <p>{state.message}</p>
            {errorIds.length > 0 && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {errorIds.map((id) => (
                  <li key={id}><a href={`#pts_${id}`}>{labelOf(id)}: {state.errors[id]}</a></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="muted">
        These are the players of <strong>{teamLabel}</strong>. {source === "dream11_manual"
          ? "Some of these are Dream11 points you entered earlier. Change any of them and save."
          : "They are pre-filled with points calculated from the scorecard. Type the points Dream11 shows for the players that differ. Only the boxes you change are saved as Dream11 points."}
      </p>

      <div className="entry-grid">
        {entries.map((e) => {
          const err = state.errors[String(e.playerId)];
          return (
            <div className="field" key={e.playerId}>
              <input type="hidden" name={`orig_${e.playerId}`} value={e.current ?? ""} />
              <label htmlFor={`pts_${e.playerId}`}>{e.name}</label>
              <input
                id={`pts_${e.playerId}`}
                name={`pts_${e.playerId}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={state.values?.[String(e.playerId)] ?? e.current ?? ""}
                key={`${e.playerId}-${state.values?.[String(e.playerId)] ?? ""}-${state.ok}`}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `err_${e.playerId}` : undefined}
              />
              {err && <span className="err" id={`err_${e.playerId}`}>{err}</span>}
            </div>
          );
        })}
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <input type="hidden" name="orig_total" value={reportedTotal ?? ""} />
        <label htmlFor="pts_total">Team total shown in Dream11</label>
        <input
          id="pts_total"
          name="total"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={state.values?.total ?? reportedTotal ?? ""}
          key={`total-${state.values?.total ?? ""}-${state.ok}`}
          aria-invalid={state.errors.total ? true : undefined}
          aria-describedby="total-hint"
        />
        <span className="hint" id="total-hint">The points Dream11 shows for the whole team, with the captain&apos;s 2x and the vice-captain&apos;s 1.5x already added. We check it against our own calculation.</span>
        {state.errors.total && <span className="err">{state.errors.total}</span>}
      </div>

      <div className="row">
        <button type="submit" className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save Dream11 points"}</button>
      </div>
    </form>
  );
}
