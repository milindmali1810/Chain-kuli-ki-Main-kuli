"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ROLES, RULES_PROFILES, DEFAULT_RULES_PROFILE } from "@/config/rules";
import type { EditorData } from "@/lib/editor";
import { checkSelection, diffFromAgent } from "@/lib/editorLogic";
import { ROLE_LABEL } from "@/lib/format";
import { confirmTeam, type ConfirmState } from "./team-actions";

const INITIAL: ConfirmState = { ok: false, message: "", problems: [] };
const rules = RULES_PROFILES[DEFAULT_RULES_PROFILE];

export function TeamEditor({ data }: { data: EditorData }) {
  const start = data.saved ?? (data.agent ? { ids: data.agent.ids, captainId: data.agent.captainId, viceId: data.agent.viceId } : { ids: [], captainId: null, viceId: null });
  const [ids, setIds] = useState<number[]>(start.ids);
  const [captainId, setCaptainId] = useState<number | null>(start.captainId);
  const [viceId, setViceId] = useState<number | null>(start.viceId);
  const [state, action, pending] = useActionState(confirmTeam, INITIAL);
  const banner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message && !state.ok) banner.current?.focus();
  }, [state]);

  const editable = data.mode !== "locked";
  const check = useMemo(() => checkSelection(data.pool, ids, captainId, viceId), [data.pool, ids, captainId, viceId]);
  const selected = ids.map((id) => data.pool.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const available = data.pool.filter((p) => !ids.includes(p.id));
  const agentIds = new Set(data.agent?.ids ?? []);
  const diff = data.agent ? diffFromAgent(data.pool, { ids: data.agent.ids, captainId: data.agent.captainId, viceId: data.agent.viceId }, { ids, captainId, viceId }) : null;

  const add = (id: number) => setIds((cur) => (cur.includes(id) || cur.length >= 15 ? cur : [...cur, id]));
  const remove = (id: number) => {
    setIds((cur) => cur.filter((x) => x !== id));
    if (captainId === id) setCaptainId(null);
    if (viceId === id) setViceId(null);
  };
  const reset = () => {
    setIds(data.agent?.ids ?? []);
    setCaptainId(data.agent?.captainId ?? null);
    setViceId(data.agent?.viceId ?? null);
  };

  const creditPct = Math.min(100, (check.credits / rules.creditCap.value) * 100);

  return (
    <section id="edit" className="card stack" aria-labelledby="edit-h">
      <h2 id="edit-h">Your team</h2>

      {data.mode === "practice" && (
        <div className="banner info" role="note">
          <Icon name="info" />
          <p><strong>Practice mode.</strong> This match has already been played, so nothing can be entered in Dream11. You can still edit and confirm a team to practise the flow.</p>
        </div>
      )}
      {data.mode === "locked" && (
        <div className="banner" role="note">
          <Icon name="alert" />
          <p><strong>Locked.</strong> This match has started, so the team can no longer be changed.</p>
        </div>
      )}
      {data.mode === "open" && (
        <p className="muted">Start from the agent&apos;s team, change anything you disagree with, and confirm. You can edit until the match starts. You then enter the team in Dream11 yourself.</p>
      )}

      <div className="facts" aria-label="Team summary">
        <div className="fact"><span className="lbl">Players</span><span className="v num">{check.count} / {rules.teamSize.value}</span></div>
        <div className="fact">
          <span className="lbl">Credits</span>
          <span className="v num">{check.credits} / {rules.creditCap.value}</span>
          <div className="bar" aria-hidden="true"><span className="track" style={{ height: 8 }}><span className="fill" style={{ width: `${creditPct}%`, background: check.credits > rules.creditCap.value ? "var(--bad)" : "var(--primary)" }} /></span></div>
        </div>
        <div className="fact">
          <span className="lbl">Roles</span>
          <span className="v" style={{ fontSize: "0.9375rem" }}>
            {ROLES.map((r) => `${ROLE_LABEL[r]} ${check.roleCounts[r]} (${rules.roleLimits[r].min.value}-${rules.roleLimits[r].max.value})`).join(" · ")}
          </span>
        </div>
        <div className="fact">
          <span className="lbl">From each side (max {rules.maxPerTeam.value})</span>
          <span className="v" style={{ fontSize: "0.9375rem" }}>{Object.entries(check.teamCounts).map(([t, n]) => `${t} ${n}`).join(" · ") || "none yet"}</span>
        </div>
      </div>

      <div aria-live="polite">
        {check.result.violations.length > 0 ? (
          <div className="banner" role="status">
            <Icon name="alert" />
            <div>
              <p><strong>Not valid yet:</strong></p>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {check.result.violations.map((v) => <li key={v.message}>{v.message}</li>)}
              </ul>
            </div>
          </div>
        ) : (
          <div className="banner info" role="status">
            <Icon name="check" />
            <p>Valid team. It passes every rule ({check.result.profile} rules).</p>
          </div>
        )}
      </div>

      <div className="entry-grid">
        <div className="field">
          <label htmlFor="cap">Captain (2x points)</label>
          <select id="cap" value={captainId ?? ""} disabled={!editable} onChange={(e) => setCaptainId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose a captain</option>
            {selected.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vc">Vice-captain (1.5x points)</label>
          <select id="vc" value={viceId ?? ""} disabled={!editable} onChange={(e) => setViceId(e.target.value ? Number(e.target.value) : null)}>
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
                  <span className="meta">{ROLE_LABEL[p.role]} · {p.team} · <span className="num">{p.credits}</span> cr{agentIds.has(p.id) ? " · Agent pick" : " · Your pick"}</span>
                </div>
                {editable && <button type="button" className="btn" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editable && (
        <div className="stack">
          <h3>Available players ({available.length})</h3>
          <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {available.map((p) => (
              <li key={p.id} className="pick-row">
                <div className="who">
                  <span className="name">{p.name}</span>
                  <span className="meta">{ROLE_LABEL[p.role]} · {p.team} · <span className="num">{p.credits}</span> cr{agentIds.has(p.id) ? " · Agent pick" : ""}</span>
                </div>
                <button type="button" className="btn" onClick={() => add(p.id)} aria-label={`Add ${p.name}`}>Add</button>
              </li>
            ))}
          </ul>
          {data.unavailable.length > 0 && (
            <p className="muted">Not offered (missing data): {data.unavailable.map((u) => `${u.name} (${u.reason})`).join("; ")}.</p>
          )}
        </div>
      )}

      {diff && (
        <div className="stack">
          <h3>What you changed from the agent&apos;s team</h3>
          {diff.same ? (
            <p className="muted">Nothing. This is the agent&apos;s team.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {diff.removed.length > 0 && <li>Out: {diff.removed.join(", ")}</li>}
              {diff.added.length > 0 && <li>In: {diff.added.join(", ")}</li>}
              {diff.captainChanged && <li>Different captain</li>}
              {diff.viceCaptainChanged && <li>Different vice-captain</li>}
            </ul>
          )}
        </div>
      )}

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
            <p className="muted">Your confirmed team was saved on {new Date(data.saved.confirmedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. You can still change it.</p>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={pending}>{pending ? "Saving…" : "Confirm my team"}</button>
            {data.agent && <button type="button" className="btn" onClick={reset}>Reset to the agent&apos;s team</button>}
          </div>
        </form>
      )}
    </section>
  );
}
