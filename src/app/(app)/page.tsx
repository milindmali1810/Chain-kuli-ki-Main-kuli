import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { formatDate, formatIst, num } from "@/lib/format";
import { dayLabel, matchState, relativeStart, type MatchState } from "@/lib/matchState";
import { listMatches, type MatchCard, type StageSummary } from "@/lib/queries";
import { TeamBadges } from "@/components/TeamBadges";
import { matchVars } from "@/lib/teamColors";
import { FindMatches } from "./FindMatches";

export const metadata = { title: "Matches" };
export const maxDuration = 120; // "Look for new matches" can build teams, which reads the history and calls Gemini

const COMING_UP = 4; // how many upcoming matches the home page shows before "see all"

const stateOf = (m: MatchCard, now: Date): MatchState =>
  matchState(
    { live: m.upcoming === true || m.cricsheetId.startsWith("live-"), startUtc: m.startUtc, hasTeam: Boolean(m.stages.final || m.stages.provisional), confirmed: Boolean(m.yourTeam && !m.yourTeam.unedited), hasActual: m.actualSource !== null },
    now,
  );

// Where the main button on a match leads: straight to the part of the page the next step needs.
const anchorFor = (s: MatchState) => (s.key === "review" ? "#team" : s.key === "confirmed" ? "#edit" : s.key === "started" ? "#enter" : "");

function bestStage(m: MatchCard): StageSummary | undefined {
  return m.stages.final ?? m.stages.provisional;
}

// The one match that needs Aryan next: a match waiting for his points, otherwise the soonest one not started.
function NextMatch({ m, now }: { m: MatchCard; now: Date }) {
  const s = stateOf(m, now);
  return (
    <section className="card hero has-stripe" style={matchVars(m.teams[0], m.teams[1])} aria-labelledby="next-h">
      <div className="row-between">
        <span className="eyebrow" id="next-h">{s.key === "started" ? "Needs your points" : "Next match"}</span>
        {m.startUtc && <span className="muted">{relativeStart(m.startUtc, now)}</span>}
      </div>
      <div className="title-row">
        <TeamBadges a={m.teams[0]} b={m.teams[1]} />
        <h2 className="hero-title">{m.teams[0]} v {m.teams[1]}</h2>
      </div>
      <p className="muted">{m.startUtc ? formatIst(m.startUtc) : formatDate(m.date)} · {m.venue}</p>
      <div className="row">
        <Link href={`/matches/${m.cricsheetId}${anchorFor(s)}`} className="btn primary">{s.action}</Link>
      </div>
    </section>
  );
}

function UpcomingRow({ m, now, withDay }: { m: MatchCard; now: Date; withDay?: boolean }) {
  const s = stateOf(m, now);
  const time = m.startUtc ? formatIst(m.startUtc).replace(/^\d+ \w+, /, "") : "";
  const when = withDay && m.startUtc ? `${dayLabel(m.startUtc, now)}, ${time}` : time;
  return (
    <Link href={`/matches/${m.cricsheetId}`} className="match-row has-edge" style={matchVars(m.teams[0], m.teams[1])} aria-label={`${m.teams[0]} versus ${m.teams[1]}, ${m.startUtc ? formatIst(m.startUtc) : ""}. ${s.label}`}>
      <span className="who">
        <span className="teams">{m.teams[0]} v {m.teams[1]}</span>
        <span className="meta">{when}</span>
      </span>
      <span className="side">
        <span className={`status ${s.tone}`}>{s.short}</span>
        <Icon name="chevron" size={18} />
      </span>
    </Link>
  );
}

function PlayedRow({ m }: { m: MatchCard }) {
  const stage = bestStage(m);
  const played = stage?.actual !== null && stage?.actual !== undefined;
  return (
    <Link href={`/matches/${m.cricsheetId}`} className="match-row has-edge" style={matchVars(m.teams[0], m.teams[1])} aria-label={`${m.teams[0]} versus ${m.teams[1]}, ${formatDate(m.date)}`}>
      <span className="who">
        <span className="teams">{m.teams[0]} v {m.teams[1]}</span>
        <span className="meta">{formatDate(m.date)}</span>
      </span>
      <span className="side">
        {stage && played && (
          <span className="pair num" aria-label={`predicted ${num(stage.predicted)}, actual ${num(stage.actual)}`}>
            <span title="Predicted">{num(stage.predicted)}</span>
            <span className="arrow" aria-hidden="true">→</span>
            <span title="Actual">{num(stage.actual)}</span>
          </span>
        )}
        {m.noResult && <span className="status plain">No result</span>}
        <Icon name="chevron" size={18} />
      </span>
    </Link>
  );
}

// How far the predicted team score was from the real one, in a sentence.
function pastSummary(played: MatchCard[]) {
  const gaps = played.flatMap((m) => {
    const st = bestStage(m);
    return st && st.actual !== null && st.actual !== undefined ? [st.predicted - st.actual] : [];
  });
  if (gaps.length === 0) return null;
  return { n: gaps.length, mae: Math.round(gaps.reduce((a, g) => a + Math.abs(g), 0) / gaps.length) };
}

function BackHome({ label }: { label: string }) {
  return (
    <div className="stack">
      <Link href="/" className="row" style={{ minHeight: 44, textDecoration: "none" }}><Icon name="back" />Matches</Link>
      <h1>{label}</h1>
    </div>
  );
}

async function MatchList({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await connection(); // read live data per visit; never run this while the app is being built
  const { show } = await searchParams;
  const now = new Date();
  const all = await listMatches();
  const upcoming = all.filter((m) => m.upcoming);
  const played = all.filter((m) => !m.upcoming);

  // ---- All past matches ----
  if (show === "played") {
    const sum = pastSummary(played);
    return (
      <div className="stack-lg">
        <BackHome label="Past matches" />
        <p className="muted">
          The agent predicted each of these using only what was known before the match. Each line shows the predicted team score, then the real one.
          {sum && <> Over {sum.n} matches the prediction was off by about {sum.mae} points on average (team scores swing a lot). </>}
          <Link href="/learning">See how it is doing</Link>.
        </p>
        <div className="rows">{played.map((m) => <PlayedRow key={m.cricsheetId} m={m} />)}</div>
      </div>
    );
  }

  // ---- All upcoming matches, grouped by day ----
  if (show === "upcoming") {
    const groups: { label: string; items: MatchCard[] }[] = [];
    for (const m of upcoming) {
      const label = m.startUtc ? dayLabel(m.startUtc, now) : formatDate(m.date);
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(m);
      else groups.push({ label, items: [m] });
    }
    return (
      <div className="stack-lg">
        <BackHome label="Upcoming matches" />
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="stack">
            <h2 className="group-h">{g.label}</h2>
            <div className="rows">{g.items.map((m) => <UpcomingRow key={m.cricsheetId} m={m} now={now} />)}</div>
          </section>
        ))}
      </div>
    );
  }

  // ---- Home: the next match, a few more, and quiet links ----
  if (all.length === 0) {
    return (
      <div className="card empty">
        <h2>No matches yet</h2>
        <p className="muted">Press &ldquo;Look for new matches&rdquo; below and the agent will find the next ones.</p>
      </div>
    );
  }
  const needsPoints = upcoming.find((m) => stateOf(m, now).key === "started" && (m.stages.final || m.stages.provisional));
  const soonest = upcoming.find((m) => stateOf(m, now).key !== "started");
  const next = needsPoints ?? soonest;
  const more = upcoming.filter((m) => m !== next).slice(0, COMING_UP);

  return (
    <div className="stack-lg">
      {next ? <NextMatch m={next} now={now} /> : (
        <div className="card empty"><h2>No upcoming matches</h2><p className="muted">Press &ldquo;Look for new matches&rdquo; below.</p></div>
      )}

      {more.length > 0 && (
        <section className="stack" aria-labelledby="coming-h">
          <h2 className="group-h" id="coming-h">Coming up</h2>
          <div className="rows">{more.map((m) => <UpcomingRow key={m.cricsheetId} m={m} now={now} withDay />)}</div>
          {upcoming.length > more.length + 1 && (
            <Link href="/?show=upcoming" className="more-link">See all {upcoming.length} upcoming matches</Link>
          )}
        </section>
      )}

      {played.length > 0 && (
        <Link href="/?show=played" className="card link-card">
          <span className="who">
            <strong>Past matches</strong>
            <span className="muted">See how the agent did on {played.length} matches already played</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="stack-lg" aria-busy="true" aria-label="Loading matches">
      <div className="skeleton" style={{ minHeight: 170 }} />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ minHeight: 64 }} />)}
    </div>
  );
}

export default function MatchesPage(props: PageProps<"/">) {
  return (
    <div className="stack-lg">
      <Suspense fallback={<ListSkeleton />}>
        <HomeTitle searchParams={props.searchParams as Promise<{ show?: string }>} />
        <MatchList searchParams={props.searchParams as Promise<{ show?: string }>} />
      </Suspense>
      <details className="quiet">
        <summary>Match missing from the list?</summary>
        <div className="stack" style={{ paddingTop: 8 }}>
          <p className="muted">The agent looks every morning. You can ask it to look now.</p>
          <FindMatches />
          <p className="muted">Still not there? <Link href="/matches/new">Add it by hand</Link>.</p>
        </div>
      </details>
    </div>
  );
}

// The big title only on the home view; the other views have their own heading.
async function HomeTitle({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  if (show === "played" || show === "upcoming") return null;
  return (
    <div className="page-head">
      <h1>Matches</h1>
      <p className="muted">Open a match to see the team the agent picked.</p>
    </div>
  );
}
