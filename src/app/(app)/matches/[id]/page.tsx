import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { ROLE_LABEL, formatDate, num, pctEffect } from "@/lib/format";
import { getMatch, type PlayerRow, type StageView } from "@/lib/queries";
import { EntryForm } from "./EntryForm";

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

function PlayerItem({ p, max }: { p: PlayerRow; max: number }) {
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
            {ROLE_LABEL[p.role] ?? p.role} · {p.team} · <span className="num">{p.credits}</span> cr
            {!p.played && <> · <span className="dnp">Did not play</span></>}
          </span>
        </div>
        <Bars predicted={p.expected} actual={p.actual} max={max} />
      </summary>
      <div className="why">
        <p>{p.reason ?? "No explanation stored yet."}</p>
        <p className="muted">
          Recent scores, oldest to newest: <span className="num">{p.lastPoints.length ? p.lastPoints.map((x) => Math.round(x)).join(", ") : "unavailable"}</span>
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
  const match = await getMatch(id);
  if (!match) notFound();

  const both = match.stages.final && match.stages.provisional;
  const stageKey: "final" | "provisional" =
    stageParam === "provisional" && match.stages.provisional ? "provisional" : match.stages.final ? "final" : "provisional";
  const view: StageView | undefined = match.stages[stageKey];

  return (
    <div className="stack-lg">
      <div className="stack">
        <Link href="/" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />All matches</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>{match.teams[0]} v {match.teams[1]}</h1>
          <p className="muted">{formatDate(match.date)} · {match.venue}</p>
        </div>
        <div className="row">
          {match.hasActual ? <span className="chip good"><Icon name="check" size={14} />Played</span> : <span className="chip warn">Not played yet</span>}
          <span className="chip">Credits are seeded, not Dream11&apos;s own</span>
        </div>
      </div>

      {!view ? (
        <div className="card empty"><h2>No team for this match</h2><p className="muted">Run a backtest to create one.</p></div>
      ) : (
        <>
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

          <div className="card">
            <div className="row-between">
              <div><span className="muted">Predicted team score</span><div className="num" style={{ fontSize: "1.75rem", fontWeight: 600 }}>{num(view.predicted)}</div></div>
              {view.actual !== null && (
                <div><span className="muted">Actual team score</span><div className="num" style={{ fontSize: "1.75rem", fontWeight: 600 }}>{num(view.actual)}</div></div>
              )}
              {view.actual !== null && (
                <div><span className="muted">Difference</span><div className="num" style={{ fontSize: "1.75rem", fontWeight: 600 }}>{view.predicted - view.actual > 0 ? "+" : ""}{num(view.predicted - view.actual)}</div></div>
              )}
            </div>
            <p className="muted" style={{ marginTop: 8 }}>Team score = the 11 players&apos; points, plus the captain&apos;s 2x and the vice-captain&apos;s 1.5x. Predicted and actual use the same formula.</p>
          </div>

          <div className="two-col">
            <section aria-labelledby="team-h" className="stack">
              <h2 id="team-h">Recommended team</h2>
              <p className="muted">Tap a player to see why he was picked. Bars compare predicted and actual points.</p>
              <div className="players">
                {(() => {
                  const max = Math.max(1, ...view.players.flatMap((p) => [p.expected, p.actual ?? 0]));
                  return view.players.map((p) => <PlayerItem key={p.playerId} p={p} max={max} />);
                })()}
              </div>
            </section>

            <aside className="stack-lg" aria-label="Reasons and notes">
              <section className="card stack" aria-labelledby="cap-h">
                <h2 id="cap-h">Captain and vice-captain</h2>
                <p>{view.captainReason ?? "No explanation stored yet."}</p>
                <p className="muted">{view.viceReason}</p>
              </section>

              <section className="card stack" aria-labelledby="pitch-h">
                <h2 id="pitch-h">Pitch and weather</h2>
                <p>{match.pitchReport ?? "No pitch report stored yet."}</p>
              </section>

              {view.summary && (
                <section className="card stack" aria-labelledby="sum-h">
                  <h2 id="sum-h">About this team</h2>
                  <p>{view.summary}</p>
                </section>
              )}

              <section className="card stack" aria-labelledby="limits-h">
                <h2 id="limits-h">What the model could not use</h2>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {view.unavailableFactors.map((f) => <li key={f}>{f}</li>)}
                </ul>
                {view.excluded.length > 0 && (
                  <p className="muted">Left out for missing data: {view.excluded.map((e) => `${e.name} (${e.reason})`).join("; ")}.</p>
                )}
                {view.deathLog.map((d) => <p className="muted" key={d}>{d}</p>)}
              </section>
            </aside>
          </div>

          <section id="enter" className="card stack" aria-labelledby="enter-h">
            <h2 id="enter-h">Enter the real Dream11 points</h2>
            <EntryForm
              cricsheetId={match.cricsheetId}
              source={match.actualSource}
              entries={view.players.map((p) => ({ playerId: p.playerId, name: p.name, current: p.actual }))}
            />
          </section>
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
