"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { findNewMatches, type FindState } from "./actions";

const INITIAL: FindState = { ok: false, message: "" };

export function FindMatches() {
  const [state, action, pending] = useActionState(findNewMatches, INITIAL);
  return (
    <form action={action} className="stack">
      <div className="row">
        <button type="submit" className="btn" disabled={pending}>{pending ? "Looking… this can take a minute" : "Look for new matches"}</button>
      </div>
      {state.message && (
        <div role={state.ok ? "status" : "alert"} className={state.ok ? "banner info" : "banner"}>
          <Icon name={state.ok ? "check" : "alert"} />
          <p>{state.message}</p>
        </div>
      )}
    </form>
  );
}
