import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { formatDate, formatIst, num } from "@/lib/format";
import { FindMatches } from "./FindMatches";
import { listMatches, type MatchCard, type StageSummary } from "@/lib/queries";

export const metadata = { title: "Matches" };
export const maxDuration = 120; // "Look for new matches" can build teams, which reads the history and calls Gemini

function Score({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="big num">{value}</span>
      <span className="lbl">{label}{hint ? ` · ${hint}` : ""}</span>
    </div>
  );
}

function MatchTile({ m }: { m: MatchCard }) {
  const stage: StageSummary | undefined = m.stages.final ?? m.stages.provisional;
  const which = m.stages.final ? "final team" : "pre-toss team";
  const played = stage?.actual !== null && stage?.actual !== undefined;
  const upcoming = m.upcoming === true;
  const gap = played && stage ? Math.round(stage.predicted - (stage.actual as number)) : null;
  return (
    <Link href={`/matches/${m.cricsheetId}`} className="card match-card" aria-label={`${m.teams[0]} versus ${m.teams[1]}, ${formatDate(m.date)}`}>
      <div className="row-between">
        <h2>{m.teams[0]} v {m.teams[1]}</h2>
        {upcoming ? <span className="chip info">Upcoming</span> : played ? <span className="chip good"><Icon name="check" size={14} />Played</span> : <span className="chip warn">Predicted</span>}
      </div>
      <p className="muted">{upcoming && m.startUtc ? formatIst(m.startUtc) : formatDate(m.date)} · {m.venue}</p>
      {upcoming && !stage && <p className="muted">The agent has not built a team for this match yet. Open it to build one.</p>}
      {stage && (
        <div className="scoreline" style={{ marginTop: 4 }}>
          <Score label={`predicted (${which})`} value={num(stage.predicted)} />
          <Score label={upcoming ? "actual" : m.actualSource === "dream11_manual" ? "actual (Dream11)" : "actual (scorecard)"} value={played ? num(stage.actual) : upcoming ? "after the match" : "pending"} />
          {m.yourTeam && (
            <Score
              label={m.yourTeam.unedited ? "your team (agent's, unedited)" : "your team"}
              value={m.yourTeam.total !== null ? num(m.yourTeam.total) : "points not entered"}
              hint={m.yourTeam.reportedTotal !== null ? `Dream11 ${num(m.yourTeam.reportedTotal)}` : undefined}
            />
          )}
        </div>
      )}
      <div className="row">
        {m.stages.final && <span className="chip info">Final</span>}
        {m.stages.provisional && <span className="chip">Provisional</span>}
        {upcoming && stage && <span className="chip">Team ready · tap to edit or confirm</span>}
        {gap !== null && <span className="chip">{gap > 0 ? `Over-predicted by ${gap}` : gap < 0 ? `Under-predicted by ${-gap}` : "Exact"}</span>}
      </div>
    </Link>
  );
}

async function MatchList() {
  await connection(); // read live data per visit; never run this while the app is being built
  const matches = await listMatches();
  if (matches.length === 0) {
    return (
      <div className="card empty">
        <h2>No matches yet</h2>
        <p className="muted">Run a backtest to create the first predicted-vs-actual match.</p>
      </div>
    );
  }
  return (
    <div className="match-list">
      {matches.map((m) => <MatchTile key={m.cricsheetId} m={m} />)}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="match-list" aria-busy="true" aria-label="Loading matches">
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}
    </div>
  );
}

export default function MatchesPage() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Matches</h1>
        <p className="muted">Tap a match to see the recommended team, the reasons, and how it compared with what really happened.</p>
      </div>
      <div className="banner info" role="note">
        <Icon name="info" />
        <p>Upcoming matches are found by the agent, which builds a team for each one before it starts. Matches marked Played are backtests: each prediction uses only data from before the match, so it is a fair test.</p>
      </div>
      <FindMatches />
      <Suspense fallback={<ListSkeleton />}>
        <MatchList />
      </Suspense>
      <p className="muted">A match missing from the list? <Link href="/matches/new">Add it by hand</Link>.</p>
    </div>
  );
}
