"use client";

import { useActionState, useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { saveActualPoints, type SaveState } from "./actions";

interface Entry {
  playerId: number;
  name: string;
  current: number | null; // what is stored now (scorecard or earlier entry)
}

const INITIAL: SaveState = { ok: false, message: "", errors: {} };

export function EntryForm({ cricsheetId, entries, source }: { cricsheetId: string; entries: Entry[]; source: string | null }) {
  const [state, action, pending] = useActionState(saveActualPoints, INITIAL);
  const summary = useRef<HTMLDivElement>(null);

  // After a failed save, move focus to the summary so keyboard and screen-reader users hear what to fix.
  useEffect(() => {
    if (state.message && !state.ok) summary.current?.focus();
  }, [state]);

  const errorIds = Object.keys(state.errors);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="match" value={cricsheetId} />

      {state.message && (
        <div
          ref={summary}
          tabIndex={-1}
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "banner info" : "banner"}
        >
          <Icon name={state.ok ? "check" : "alert"} />
          <div>
            <p>{state.message}</p>
            {errorIds.length > 0 && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {errorIds.map((id) => (
                  <li key={id}><a href={`#pts_${id}`}>{entries.find((e) => String(e.playerId) === id)?.name}: {state.errors[id]}</a></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="muted">
        {source === "dream11_manual"
          ? "These are the Dream11 points you entered earlier. Change any of them and save."
          : "Pre-filled with points computed from the scorecard. Type the real Dream11 points for the players you want to change. Only the boxes you change are saved as Dream11 points."}
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

      <div className="row">
        <button type="submit" className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save Dream11 points"}</button>
      </div>
    </form>
  );
}
