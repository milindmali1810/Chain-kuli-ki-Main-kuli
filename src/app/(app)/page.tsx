import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { formatDate, formatIst, num } from "@/lib/format";
import { dayLabel, matchState, relativeStart, type MatchState } from "@/lib/matchState";
import { listMatches, type MatchCard, type StageSummary } from "@/lib/queries";
import { FindMatches } from "./FindMatches";

export const metadata = { title: "Matches" };
export const maxDuration = 120; // "Look for new matches" can build teams, which reads the history and calls Gemini

const stateOf = (m: MatchCard, now: Date): MatchState =>
  matchState(
    { live: m.upcoming === true || m.cricsheetId.startsWith("live-"), startUtc: m.startUtc, hasTeam: Boolean(m.stages.final || m.stages.provisional), confirmed: Boolean(m.yourTeam && !m.yourTeam.unedited), hasActual: m.actualSource !== null },
    now,
  );

// Where the main button on a match leads: straight to the part of the page the next step needs.
const anchorFor = (s: MatchState) => (s.key === "review" ? "#team" : s.key === "confirmed" ? "#edit" : s.key === "started" ? "#enter" : "");

function ToneChip({ s }: { s: MatchState }) {
  const cls = s.tone === "good" ? "chip good" : s.tone === "warn" ? "chip warn" : s.tone === "info" ? "chip info" : "chip";
  return <span className={cls}>{s.label}</span>;
}

function bestStage(m: MatchCard): StageSummary | undefined {
  return m.stages.final ?? m.stages.provisional;
}

// The one match that needs Aryan next: a match waiting for his points, otherwise the soonest one not started.
function NextMatch({ m, now }: { m: MatchCard; now: Date }) {
  const s = stateOf(m, now);
  const stage = bestStage(m);
  return (
    <section className="card hero" aria-labelledby="next-h">
      <div className="row-between">
        <span className="eyebrow" id="next-h">{s.key === "started" ? "Needs your points" : "Next match"}</span>
        {m.startUtc && <span className="chip"><Icon name="clock" size={14} />{relativeStart(m.startUtc, now)}</span>}
      </div>
      <h2 className="hero-title">{m.teams[0]} v {m.teams[1]}</h2>
      <p className="muted">{m.startUtc ? formatIst(m.startUtc) : formatDate(m.date)} · {m.venue}</p>
      <div className="row">
        <ToneChip s={s} />
        {stage && <span className="chip">Predicted team score <span className="num">{num(stage.predicted)}</span></span>}
      </div>
      <div className="row">
        <Link href={`/matches/${m.cricsheetId}${anchorFor(s)}`} className="btn primary">{s.action}</Link>
      </div>
    </section>
  );
}

function UpcomingRow({ m, now }: { m: MatchCard; now: Date }) {
  const s = stateOf(m, now);
  return (
    <Link href={`/matches/${m.cricsheetId}`} className="match-row" aria-label={`${m.teams[0]} versus ${m.teams[1]}, ${m.startUtc ? formatIst(m.startUtc) : ""}. ${s.label}`}>
      <span className="who">
        <span className="teams">{m.teams[0]} v {m.teams[1]}</span>
        <span className="meta">{m.startUtc ? formatIst(m.startUtc).replace(/^\d+ \w+, /, "") : ""} · {m.venue}</span>
      </span>
      <span className="side">
        <ToneChip s={s} />
        <Icon name="chevron" size={18} />
      </span>
    </Link>
  );
}

function PlayedRow({ m }: { m: MatchCard }) {
  const stage = bestStage(m);
  const played = stage?.actual !== null && stage?.actual !== undefined;
  const gap = played && stage ? Math.round(stage.predicted - (stage.actual as number)) : null;
  return (
    <Link href={`/matches/${m.cricsheetId}`} className="match-row" aria-label={`${m.teams[0]} versus ${m.teams[1]}, ${formatDate(m.date)}`}>
      <span className="who">
        <span className="teams">{m.teams[0]} v {m.teams[1]}</span>
        <span className="meta">{formatDate(m.date)} · {m.venue}</span>
      </span>
      <span className="side">
        {stage && played && (
          <span className="pair num" aria-label={`predicted ${num(stage.predicted)}, actual ${num(stage.actual)}`}>
            <span title="Predicted">{num(stage.predicted)}</span>
            <span className="arrow" aria-hidden="true">→</span>
            <span title="Actual">{num(stage.actual)}</span>
          </span>
        )}
        {gap !== null && <span className="chip">{gap > 0 ? `Over by ${gap}` : gap < 0 ? `Under by ${-gap}` : "Exact"}</span>}
        <Icon name="chevron" size={18} />
      </span>
    </Link>
  );
}

async function MatchList({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await connection(); // read live data per visit; never run this while the app is being built
  const { show } = await searchParams;
  const now = new Date();
  const all = await listMatches();
  if (all.length === 0) {
    return (
      <div className="card empty">
        <h2>No matches yet</h2>
        <p className="muted">Press &ldquo;Look for new matches&rdquo; and the agent will find the next ones.</p>
      </div>
    );
  }

  const upcoming = all.filter((m) => m.upcoming);
  const played = all.filter((m) => !m.upcoming);
  const tab: "upcoming" | "played" = show === "played" || (upcoming.length === 0 && show !== "upcoming") ? "played" : "upcoming";

  // The match that needs Aryan next.
  const needsPoints = upcoming.find((m) => stateOf(m, now).key === "started" && (m.stages.final || m.stages.provisional));
  const soonest = upcoming.find((m) => stateOf(m, now).key !== "started");
  const next = needsPoints ?? soonest;

  // Upcoming grouped by day: Today, Tomorrow, Sat 17 Oct ...
  const groups: { label: string; items: MatchCard[] }[] = [];
  for (const m of upcoming) {
    const label = m.startUtc ? dayLabel(m.startUtc, now) : formatDate(m.date);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="stack-lg">
      {next && <NextMatch m={next} now={now} />}

      <div className="stack">
        <div className="seg" role="group" aria-label="Which matches to show">
          <Link href="/?show=upcoming" aria-current={tab === "upcoming" ? "true" : undefined} scroll={false}>Upcoming <span className="count num">{upcoming.length}</span></Link>
          <Link href="/?show=played" aria-current={tab === "played" ? "true" : undefined} scroll={false}>Played <span className="count num">{played.length}</span></Link>
        </div>
        {tab === "played" && (
          <p className="muted">Matches already played, used as a fair test: each prediction used only data from before the match. The numbers show predicted, then actual team score.</p>
        )}
      </div>

      {tab === "upcoming" ? (
        upcoming.length === 0 ? (
          <div className="card empty">
            <h2>No upcoming matches yet</h2>
            <p className="muted">Press &ldquo;Look for new matches&rdquo; below. The agent also checks every morning.</p>
          </div>
        ) : (
          <div className="stack-lg">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label} className="stack">
                <h2 className="group-h">{g.label}</h2>
                <div className="rows">{g.items.map((m) => <UpcomingRow key={m.cricsheetId} m={m} now={now} />)}</div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="rows">{played.map((m) => <PlayedRow key={m.cricsheetId} m={m} />)}</div>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="stack-lg" aria-busy="true" aria-label="Loading matches">
      <div className="skeleton" style={{ minHeight: 190 }} />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ minHeight: 64 }} />)}
    </div>
  );
}

export default function MatchesPage(props: PageProps<"/">) {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Matches</h1>
        <p className="muted">The agent finds the matches and picks a team for each one. Open a match to review the team, change anything you like, and confirm.</p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <MatchList searchParams={props.searchParams as Promise<{ show?: string }>} />
      </Suspense>
      <div className="card stack">
        <h2>Missing a match?</h2>
        <p className="muted">The agent looks every morning. You can ask it to look now.</p>
        <FindMatches />
        <p className="muted">Still not there? <Link href="/matches/new">Add it by hand</Link>.</p>
      </div>
    </div>
  );
}
