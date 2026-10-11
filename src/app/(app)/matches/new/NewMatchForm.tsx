"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { createUpcomingMatch, type NewMatchState } from "./actions";

const INITIAL: NewMatchState = { message: "", errors: {}, values: {} };

export function NewMatchForm({ teams, venues }: { teams: string[]; venues: string[] }) {
  const [state, action, pending] = useActionState(createUpcomingMatch, INITIAL);
  const field = (name: string, label: string, hint?: string, extra?: { list?: string; type?: string }) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={extra?.type ?? "text"}
        list={extra?.list}
        autoComplete="off"
        defaultValue={state.values[name] ?? ""}
        key={`${name}-${state.values[name] ?? ""}`}
        aria-invalid={state.errors[name] ? true : undefined}
        aria-describedby={`${name}-d`}
      />
      <span className="hint" id={`${name}-d`}>{hint}</span>
      {state.errors[name] && <span className="err">{state.errors[name]}</span>}
    </div>
  );

  return (
    <form action={action} className="stack" noValidate>
      {state.message && (
        <div role="alert" className="banner">
          <Icon name="alert" />
          <p>{state.message}</p>
        </div>
      )}
      <datalist id="teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="venues">{venues.map((v) => <option key={v} value={v} />)}</datalist>
      {field("teamA", "First team", "Start typing and pick from the list.", { list: "teams" })}
      {field("teamB", "Second team", undefined, { list: "teams" })}
      {field("venue", "Venue", "Pick a ground from the list. A brand-new ground can be added on the Data screen.", { list: "venues" })}
      {field("startLocal", "Start time (Indian time)", "As shown on Dream11. The team can be edited until this time.", { type: "datetime-local" })}
      <div className="row">
        <button type="submit" className="btn primary" disabled={pending}>{pending ? "Saving…" : "Add upcoming match"}</button>
      </div>
    </form>
  );
}
