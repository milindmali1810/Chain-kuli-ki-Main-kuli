import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { CAPTAIN_INTRO, CAPTAIN_STEPS } from "@/lib/captainRules";
import { ROLE_LABEL, formatDate, formatIst, num, pctEffect } from "@/lib/format";
import { getMatch, type PlayerRow, type StageView } from "@/lib/queries";
import { loadEditorData } from "@/lib/editor";
import { reconcile } from "@/lib/editorLogic";
import { matchState } from "@/lib/matchState";
import { teamScore } from "@/lib/teamScore";
import { TeamBadges } from "@/components/TeamBadges";
import { matchVars } from "@/lib/teamColors";
import { EntryForm } from "./EntryForm";
import { TeamEditor } from "./TeamEditor";
import { buildTeamNow } from "./setup/actions";

function Bars({ predicted, actual, max }: { predicted: number; actual: number | null; max: number }) {
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="bars">
      <div className="bar pred">
        <span className="tag">Predicted</span>
        <span className="track"><span className="fill" style={{ width: w(predicted) }} /></span>
        <span className="val num">{num(predicted)}</span>
      </div>
      {actual !== null && (
        <div className="bar act">
          <span className="tag">Actual</span>
          <span className="track"><span className="fill" style={{ width: w(actual) }} /></span>
          <span className="val num">{num(actual)}</span>
        </div>
      )}
    </div>
  );
}

// A player is one calm line (name, role, team). The bars and the detail only show when asked for, or after the match.
function PlayerItem({ p, max, showBars }: { p: PlayerRow; max: number; showBars: boolean }) {
  return (
    <details className="player">
      <summary>
        <div className="who">
          <span className="name">
            {p.name}
            {p.isCaptain && <span className="badge-c" aria-label="Captain">C</span>}
            {p.isViceCaptain && <span className="badge-c" aria-label="Vice-captain">VC</span>}
          </span>
          <span className="meta">
            {ROLE_LABEL[p.role] ?? p.role} · {p.team}
            {!p.played && <> · <span className="dnp">Did not play</span></>}
          </span>
        </div>
        {showBars ? <Bars predicted={p.expected} actual={p.actual} max={max} /> : <span className="pts-sm num" title="Points the agent expects">{num(p.expected)}</span>}
      </summary>
      <div className="why">
        <p>{p.reason ?? "The reason is still being written. Refresh in about a minute."}</p>
        <p className="muted">
          Recent scores, oldest to newest: <span className="num">{p.lastPoints.length ? p.lastPoints.map((x) => Math.round(x)).join(", ") : "unavailable"}</span>
          {" · "}<span className="num">{p.credits}</span> credits
        </p>
        <div className="row">
          {p.pPlay < 1 && <span className="chip warn">Chance of playing {Math.round(p.pPlay * 100)}%</span>}
          {p.venueMultiplier !== 1 && <span className="chip">Venue {pctEffect(p.venueMultiplier)}</span>}
          {p.teamFormMultiplier !== 1 && <span className="chip">Team form {pctEffect(p.teamFormMultiplier)}</span>}
          {p.reasonSource && <span className="chip info">{p.reasonSource === "gemini" ? "Written by Gemini, checked by code" : "Plain template from the numbers"}</span>}
        </div>
      </div>
    </details>
  );
}

function Weather({ w }: { w: NonNullable<Awaited<ReturnType<typeof getMatch>>>["weather"] }) {
  if (!w) return <>unavailable</>;
  return <>{num(w.tempC, 0)}°C, {num(w.humidityPct, 0)}% humidity</>;
}

async function MatchView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string }> }) {
  await connection(); // read live data per visit; never run this while the app is being built
  const { id } = await params;
  const { stage: stageParam } = await searchParams;
  const [match, editor] = await Promise.all([getMatch(id), loadEditorData(id)]);
  if (!match) notFound();

  const both = match.stages.final && match.stages.provisional;
  const stageKey: "final" | "provisional" =
    stageParam === "provisional" && match.stages.provisional ? "provisional" : match.stages.final ? "final" : "provisional";
  const view: StageView | undefined = match.stages[stageKey];
  const live = match.cricsheetId.startsWith("live-");
  const state = matchState({ live, startUtc: match.startUtc, hasTeam: Boolean(view), confirmed: Boolean(editor?.saved), hasActual: match.hasActual }, new Date());
  const confirmed = Boolean(editor?.saved);
  const played = match.hasActual;

  return (
    <div className="stack-lg">
      <div className="stack">
        <Link href="/" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />Matches</Link>
        <div className="stripe-pill" style={matchVars(match.teams[0], match.teams[1])} aria-hidden="true" />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div className="title-row">
            <TeamBadges a={match.teams[0]} b={match.teams[1]} />
            <h1>{match.teams[0]} v {match.teams[1]}</h1>
          </div>
          <p className="muted">{match.upcoming ? formatIst(match.startUtc) : formatDate(match.date)} · {match.venue}</p>
        </div>
        <p><span className={`status ${live ? state.tone : played ? "good" : "plain"}`}>{live ? state.label : played ? "Played" : "Not played yet"}</span></p>
        {live && view && (
          <ol className="steps" aria-label="What to do">
            <li><a href="#team" className="step" aria-current={state.step === 1 ? "step" : undefined} data-done={confirmed || state.step === 3}><span className="n">Step 1</span><span className="t">Review the team</span></a></li>
            <li><a href="#edit" className="step" aria-current={state.step === 2 ? "step" : undefined} data-done={confirmed}><span className="n">Step 2</span><span className="t">Edit and confirm</span></a></li>
            <li><a href="#enter" className="step" aria-current={state.step === 3 && !played ? "step" : undefined} data-done={played}><span className="n">Step 3</span><span className="t">Enter points</span></a></li>
          </ol>
        )}
      </div>

      {!view ? (
        <div className="card empty">
          <h2>No team for this match yet</h2>
          <p className="muted">
            {live
              ? "The agent builds a team for every upcoming match about 3 days before it starts. You can ask for it now."
              : "Run a backtest to create one."}
          </p>
          {live && !played && (
            <form action={buildTeamNow} className="row">
              <input type="hidden" name="match" value={match.cricsheetId} />
              <button type="submit" className="btn primary">Build the team now</button>
            </form>
          )}
        </div>
      ) : (
        <>
          {/* A match already played: the result first, because that is what it is for. */}
          {view.actual !== null && (
            <div className="card">
              <div className="row-between">
                <div><span className="muted">Predicted</span><div className="num big-n">{num(view.predicted)}</div></div>
                <div><span className="muted">Actual</span><div className="num big-n">{num(view.actual)}</div></div>
                <div><span className="muted">Difference</span><div className="num big-n">{view.predicted - view.actual > 0 ? "+" : ""}{num(view.predicted - view.actual)}</div></div>
              </div>
            </div>
          )}

          <div className="two-col">
            <section id="team" aria-labelledby="team-h" className="stack">
              <h2 id="team-h">{live ? "The agent's team" : "The team"}</h2>
              <p className="muted">
                {live && !played
                  ? "Tap a player to see why. This is a prediction: the real playing XI is announced at the toss."
                  : "Tap a player to see why he was picked."}
              </p>
              <div className="players">
                {(() => {
                  const max = Math.max(1, ...view.players.flatMap((p) => [p.expected, p.actual ?? 0]));
                  return view.players.map((p) => <PlayerItem key={p.playerId} p={p} max={max} showBars={view.actual !== null} />);
                })()}
              </div>
            </section>

            <aside className="stack-lg" aria-label="Captain">
              <section className="card stack" aria-labelledby="cap-h">
                <h2 id="cap-h">Captain and vice-captain</h2>
                {(() => {
                  const cap = view.players.find((p) => p.isCaptain);
                  const vc = view.players.find((p) => p.isViceCaptain);
                  return (
                    <>
                      <div className="stack">
                        <p><span className="badge-c" style={{ marginLeft: 0, marginRight: 8 }}>C</span><strong>{cap?.name ?? "No captain"}</strong> <span className="muted">(2x points)</span></p>
                        <p>{view.captainReason ?? "The reason is still being written. Refresh in about a minute."}</p>
                      </div>
                      <div className="stack">
                        <p><span className="badge-c" style={{ marginLeft: 0, marginRight: 8 }}>VC</span><strong>{vc?.name ?? "No vice-captain"}</strong> <span className="muted">(1.5x points)</span></p>
                        <p>{view.viceReason}</p>
                      </div>
                    </>
                  );
                })()}
              </section>
            </aside>
          </div>

          {editor && (
            live && !played ? (
              <TeamEditor data={editor} />
            ) : (
              <details className="more">
                <summary>Try changing this team (practice)</summary>
                <div className="body"><TeamEditor data={editor} /></div>
              </details>
            )
          )}

          {(() => {
            // After the match Aryan records what HIS team scored: his confirmed team, or the agent's if he never edited it.
            const teamIds = editor?.saved?.ids ?? editor?.agent?.ids ?? view.players.map((p) => p.playerId);
            const captainId = editor?.saved ? editor.saved.captainId : editor?.agent?.captainId ?? null;
            const viceId = editor?.saved ? editor.saved.viceId : editor?.agent?.viceId ?? null;
            const nameOf = new Map([...(editor?.pool ?? []).map((p) => [p.id, p.name] as const), ...view.players.map((p) => [p.playerId, p.name] as const)]);
            const points = editor?.actualById ?? null;
            const complete = points !== null && teamIds.length > 0 && teamIds.every((id) => points[id] !== undefined);
            const yourTotal = complete
              ? Math.round(teamScore(new Map(Object.entries(points).map(([k, v]) => [Number(k), v])), teamIds, captainId, viceId) * 10) / 10
              : null;
            const check = yourTotal !== null ? reconcile(yourTotal, editor?.saved?.reportedTotal ?? null) : null;
            // Closed until it is time: before the match there is nothing to enter.
            const open = state.step === 3 && live && !played;
            return (
              <details id="enter" className="more" open={open}>
                <summary>After the match: enter the points your team scored</summary>
                <div className="body">
                  {yourTotal !== null ? (
                    <div className="card" style={{ background: "var(--surface-2)" }} aria-live="polite">
                      <span className="muted">{editor?.saved ? "Your team scored" : "The agent's team (which you have not edited) scored"}</span>
                      <div className="num" style={{ fontSize: "1.75rem", fontWeight: 600 }}>{num(yourTotal, 1)}</div>
                      <p className="muted">11 players plus the captain&apos;s 2x and the vice-captain&apos;s 1.5x.</p>
                      {check && (
                        <p style={{ marginTop: 8 }}>
                          <span className={`chip ${check.matches ? "good" : "warn"}`}>{check.matches ? "Matches Dream11" : "Differs from Dream11"}</span>{" "}
                          {check.message}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="muted">Enter the points below to see what your team scored.</p>
                  )}
                  <EntryForm
                    cricsheetId={match.cricsheetId}
                    source={match.actualSource}
                    reportedTotal={editor?.saved?.reportedTotal ?? null}
                    teamLabel={editor?.saved ? "the team you confirmed" : "the agent's team (you have not edited it)"}
                    entries={teamIds.map((id) => ({ playerId: id, name: nameOf.get(id) ?? String(id), current: points?.[id] ?? null }))}
                  />
                </div>
              </details>
            );
          })()}

          {/* Everything else, for when Aryan wants it. */}
          <details className="more">
            <summary>More about this team</summary>
            <div className="body">
              {both && (
                <div className="stack">
                  <div className="seg" role="group" aria-label="Which team to show">
                    <Link href={`/matches/${id}?stage=final`} aria-current={stageKey === "final" ? "true" : undefined} scroll={false}>Final</Link>
                    <Link href={`/matches/${id}?stage=provisional`} aria-current={stageKey === "provisional" ? "true" : undefined} scroll={false}>Provisional</Link>
                  </div>
                  <p className="muted">
                    {stageKey === "final"
                      ? "Final: built from the confirmed playing XI, which is announced at the toss."
                      : "Provisional: built before the toss from each side's predicted XI. Predicted players may not play."}
                  </p>
                </div>
              )}
              <div className="facts">
                <div className="fact"><span className="lbl">Rules check</span><span className="v">{view.validation?.valid ? "Valid team" : "Not valid"}</span></div>
                <div className="fact"><span className="lbl">Credits used</span><span className="v num">{view.totalCredits} / 100</span></div>
                <div className="fact"><span className="lbl">Pitch</span><span className="v">{match.pitch ? match.pitch.tag.replace("_", " ").toLowerCase() : "unavailable"}</span></div>
                <div className="fact"><span className="lbl">Evening weather</span><span className="v" style={{ fontSize: "1rem" }}><Weather w={match.weather} /></span></div>
              </div>
              {view.actual === null && (
                <p className="muted">Predicted team score: <span className="num">{num(view.predicted)}</span> (the 11 players&apos; points, plus the captain&apos;s 2x and the vice-captain&apos;s 1.5x).</p>
              )}
              {(match.stages.final ?? match.stages.provisional)?.creditsSeeded !== false && (
                <p className="muted">Credits are the agent&apos;s own estimates, not Dream11&apos;s.</p>
              )}
              <p>{match.pitchReport ?? "No pitch report stored yet."}</p>
              {view.summary && <p>{view.summary}</p>}
              <details className="how">
                <summary>How the captain is chosen</summary>
                <div className="stack" style={{ paddingTop: 8 }}>
                  <p className="muted">{CAPTAIN_INTRO}</p>
                  {CAPTAIN_STEPS.map((s) => <p key={s.title}><strong>{s.title}.</strong> {s.text}</p>)}
                </div>
              </details>
              <details className="how">
                <summary>What the model could not use</summary>
                <div className="stack" style={{ paddingTop: 8 }}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{view.unavailableFactors.map((f) => <li key={f}>{f}</li>)}</ul>
                  {view.excluded.length > 0 && <p className="muted">Left out for missing data: {view.excluded.map((e) => `${e.name} (${e.reason})`).join("; ")}.</p>}
                  {view.deathLog.map((d) => <p className="muted" key={d}>{d}</p>)}
                </div>
              </details>
              {live && !played && (
                <div className="row">
                  <form action={buildTeamNow}>
                    <input type="hidden" name="match" value={match.cricsheetId} />
                    <button type="submit" className="btn">Update the team now</button>
                  </form>
                  <Link href={`/matches/${id}/setup`} className="btn">Change XI or credits</Link>
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export default function MatchPage(props: PageProps<"/matches/[id]">) {
  return (
    <Suspense fallback={<div className="stack-lg" aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" style={{ minHeight: 280 }} /></div>}>
      <MatchView params={props.params} searchParams={props.searchParams as Promise<{ stage?: string }>} />
    </Suspense>
  );
}
