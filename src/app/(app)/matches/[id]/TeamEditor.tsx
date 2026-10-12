"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ROLES, RULES_PROFILES, DEFAULT_RULES_PROFILE } from "@/config/rules";
import type { EditorData } from "@/lib/editor";
import { checkSelection, diffFromAgent, orderReplacements } from "@/lib/editorLogic";
import { ROLE_LABEL } from "@/lib/format";
import { confirmTeam, type ConfirmState } from "./team-actions";

const INITIAL: ConfirmState = { ok: false, message: "", problems: [] };
const rules = RULES_PROFILES[DEFAULT_RULES_PROFILE];

// Step 2. Quiet by default: one line saying whether the team is valid, and the Confirm button. Changing players, the
// captain or the vice-captain opens only when asked for (or when the team stops being valid, so the problem is visible).
export function TeamEditor({ data }: { data: EditorData }) {
  const start = data.saved ?? (data.agent ? { ids: data.agent.ids, captainId: data.agent.captainId, viceId: data.agent.viceId } : { ids: [], captainId: null, viceId: null });
  const [ids, setIds] = useState<number[]>(start.ids);
  const [captainId, setCaptainId] = useState<number | null>(start.captainId);
  const [viceId, setViceId] = useState<number | null>(start.viceId);
  const [open, setOpen] = useState(false);
  // The player Aryan just took out, so the list of replacements can start with players who cost the same credits.
  const [lastRemoved, setLastRemoved] = useState<{ name: string; credits: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [state, action, pending] = useActionState(confirmTeam, INITIAL);
  const banner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message && !state.ok) banner.current?.focus();
  }, [state]);

  const editable = data.mode !== "locked";
  const check = useMemo(() => checkSelection(data.pool, ids, captainId, viceId), [data.pool, ids, captainId, viceId]);
  const selected = ids.map((id) => data.pool.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const creditsLeft = Math.round((rules.creditCap.value - check.credits) * 10) / 10;
  // Replacements: same credits as the player just removed first, then anyone who still fits, then the rest; dearest first.
  const available = orderReplacements(data.pool.filter((p) => !ids.includes(p.id)), creditsLeft, lastRemoved?.credits ?? null);
  const agentIds = new Set(data.agent?.ids ?? []);
  const diff = data.agent ? diffFromAgent(data.pool, { ids: data.agent.ids, captainId: data.agent.captainId, viceId: data.agent.viceId }, { ids, captainId, viceId }) : null;
  const valid = check.result.violations.length === 0;

  const add = (id: number) => {
    setIds((cur) => (cur.includes(id) || cur.length >= 15 ? cur : [...cur, id]));
    setLastRemoved(null);
  };
  const remove = (id: number) => {
    const gone = data.pool.find((p) => p.id === id);
    if (gone) setLastRemoved({ name: gone.name, credits: gone.credits });
    setAddOpen(true); // show the replacements straight away
    setIds((cur) => cur.filter((x) => x !== id));
    if (captainId === id) setCaptainId(null);
    if (viceId === id) setViceId(null);
  };
  const reset = () => {
    setIds(data.agent?.ids ?? []);
    setCaptainId(data.agent?.captainId ?? null);
    setViceId(data.agent?.viceId ?? null);
    setLastRemoved(null);
  };
  const creditPct = Math.min(100, (check.credits / rules.creditCap.value) * 100);

  return (
    <section id="edit" className="card stack" aria-labelledby="edit-h">
      <h2 id="edit-h">Keep this team, or change it</h2>

      {data.mode === "practice" && (
        <div className="banner info" role="note">
          <Icon name="info" />
          <p><strong>Practice mode.</strong> This match has already been played, so nothing can be entered in Dream11. You can still edit and confirm a team to practise.</p>
        </div>
      )}
      {data.mode === "locked" && (
        <div className="banner" role="note">
          <Icon name="alert" />
          <p><strong>Locked.</strong> This match has started, so the team can no longer be changed.</p>
        </div>
      )}
      {data.mode === "open" && (
        <p className="muted">Happy with the agent&apos;s team? Just confirm it. Want something different? Open &ldquo;Change players&rdquo;. You can edit until the match starts, then enter the team in Dream11 yourself.</p>
      )}

      <div aria-live="polite">
        {valid ? (
          <p className="status good wrap">Valid team · <span className="num">{check.count}</span>/{rules.teamSize.value} players · <span className="num">{check.credits}</span>/{rules.creditCap.value} credits · <span className="num">{creditsLeft}</span> left</p>
        ) : (
          <div className="banner" role="status">
            <Icon name="alert" />
            <div>
              <p><strong>Not valid yet:</strong></p>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {check.result.violations.map((v) => <li key={v.message}>{v.message}</li>)}
              </ul>
            </div>
          </div>
        )}
        {diff && !diff.same && (
          <p className="muted" style={{ marginTop: 6 }}>
            You changed:{diff.removed.length > 0 && <> out {diff.removed.join(", ")};</>}{diff.added.length > 0 && <> in {diff.added.join(", ")};</>}
            {diff.captainChanged && <> different captain;</>}{diff.viceCaptainChanged && <> different vice-captain;</>}
          </p>
        )}
      </div>

      {editable && (
        <form action={action} className="stack">
          <input type="hidden" name="match" value={data.cricsheetId} />
          <input type="hidden" name="team" value={JSON.stringify({ ids, captainId, viceId })} />
          {state.message && (
            <div ref={banner} tabIndex={-1} role={state.ok ? "status" : "alert"} className={state.ok ? "banner info" : "banner"}>
              <Icon name={state.ok ? "check" : "alert"} />
              <div>
                <p>{state.message}</p>
                {state.problems.length > 0 && <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{state.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
              </div>
            </div>
          )}
          {data.saved && !state.message && (
            <p className="muted">You confirmed this team on {new Date(data.saved.confirmedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. You can still change it.</p>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={pending}>{pending ? "Saving…" : data.saved ? "Confirm again" : "Confirm my team"}</button>
          </div>
        </form>
      )}

      {editable && (
        <details className="more" open={open || !valid} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Change players, captain or vice-captain</summary>
          <div className="body">
            <div className="bar" aria-hidden="true"><span className="track" style={{ height: 8 }}><span className="fill" style={{ width: `${creditPct}%`, background: check.credits > rules.creditCap.value ? "var(--bad)" : "var(--primary)" }} /></span></div>
            <p className="muted">
              Roles: {ROLES.map((r) => `${ROLE_LABEL[r]} ${check.roleCounts[r]} (${rules.roleLimits[r].min.value}-${rules.roleLimits[r].max.value})`).join(" · ")}
              {" · "}From each side (max {rules.maxPerTeam.value}): {Object.entries(check.teamCounts).map(([t, n]) => `${t} ${n}`).join(" · ") || "none yet"}
            </p>

            <div className="entry-grid">
              <div className="field">
                <label htmlFor="cap">Captain (2x points)</label>
                <select id="cap" value={captainId ?? ""} onChange={(e) => setCaptainId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choose a captain</option>
                  {selected.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="vc">Vice-captain (1.5x points)</label>
                <select id="vc" value={viceId ?? ""} onChange={(e) => setViceId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choose a vice-captain</option>
                  {selected.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="stack">
              <h3>Your players ({selected.length})</h3>
              {selected.length === 0 ? (
                <p className="muted">No players yet. Add some from the list below, or reset to the agent&apos;s team.</p>
              ) : (
                <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {selected.map((p) => (
                    <li key={p.id} className="pick-row">
                      <div className="who">
                        <span className="name">
                          {p.name}
                          {p.id === captainId && <span className="badge-c" aria-label="Captain">C</span>}
                          {p.id === viceId && <span className="badge-c" aria-label="Vice-captain">VC</span>}
                        </span>
                        <span className="meta">{ROLE_LABEL[p.role]} · {p.team} · <span className="num">{p.credits}</span> cr{agentIds.has(p.id) ? "" : " · Your pick"}</span>
                      </div>
                      <span className="cr-badge num" title="Credits">{p.credits} cr</span>
                      <button type="button" className="btn" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <details className="how" open={addOpen} onToggle={(e) => setAddOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Add a player ({available.length} available)</summary>
              <div className="stack" style={{ paddingTop: 8 }}>
                <p className="muted">
                  <strong className="num">{creditsLeft}</strong> credits left.
                  {lastRemoved ? <> You removed {lastRemoved.name} (<span className="num">{lastRemoved.credits}</span> cr), so players with the <strong>same credits</strong> are first.</> : " Dearest first."}
                </p>
                <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {available.map((p) => {
                    const same = lastRemoved !== null && p.credits === lastRemoved.credits;
                    const tooDear = p.credits > creditsLeft && !same; // creditsLeft already includes the credits freed by the removal
                    return (
                      <li key={p.id} className={`pick-row${same ? " same" : ""}${tooDear ? " dear" : ""}`}>
                        <div className="who">
                          <span className="name">{p.name}</span>
                          <span className="meta">{ROLE_LABEL[p.role]} · {p.team}{same ? " · same credits" : tooDear ? " · over the credit limit" : ""}</span>
                        </div>
                        <span className="cr-badge num" title="Credits">{p.credits} cr</span>
                        <button type="button" className="btn" onClick={() => add(p.id)} aria-label={`Add ${p.name}`}>Add</button>
                      </li>
                    );
                  })}
                </ul>
                {data.unavailable.length > 0 && (
                  <p className="muted">Not offered (missing data): {data.unavailable.map((u) => `${u.name} (${u.reason})`).join("; ")}.</p>
                )}
              </div>
            </details>

            {data.agent && <div className="row"><button type="button" className="btn" onClick={reset}>Reset to the agent&apos;s team</button></div>}
          </div>
        </details>
      )}
    </section>
  );
}
