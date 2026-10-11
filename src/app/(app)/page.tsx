import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { formatDate, num } from "@/lib/format";
import { listMatches, type MatchCard, type StageSummary } from "@/lib/queries";

export const metadata = { title: "Matches" };

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
  const gap = played && stage ? Math.round(stage.predicted - (stage.actual as number)) : null;
  return (
    <Link href={`/matches/${m.cricsheetId}`} className="card match-card" aria-label={`${m.teams[0]} versus ${m.teams[1]}, ${formatDate(m.date)}`}>
      <div className="row-between">
        <h2>{m.teams[0]} v {m.teams[1]}</h2>
        {played ? <span className="chip good"><Icon name="check" size={14} />Played</span> : <span className="chip warn">Predicted</span>}
      </div>
      <p className="muted">{formatDate(m.date)} · {m.venue}</p>
      {stage && (
        <div className="scoreline" style={{ marginTop: 4 }}>
          <Score label={`predicted (${which})`} value={num(stage.predicted)} />
          <Score label={m.actualSource === "dream11_manual" ? "actual (Dream11)" : "actual (scorecard)"} value={played ? num(stage.actual) : "pending"} />
        </div>
      )}
      <div className="row">
        {m.stages.final && <span className="chip info">Final</span>}
        {m.stages.provisional && <span className="chip">Provisional</span>}
        {gap !== null && <span className="chip">{gap > 0 ? `Over-predicted by ${gap}` : gap < 0 ? `Under-predicted by ${-gap}` : "Exact"}</span>}
      </div>
    </Link>
  );
}

async function MatchList() {
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
        <p>These matches have already been played. Each prediction uses only data from before the match, so it is a fair test.</p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <MatchList />
      </Suspense>
    </div>
  );
}
