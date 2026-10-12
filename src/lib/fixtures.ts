// Upcoming-match finder: pure parts. Reads the CricAPI (cricketdata.org) match list and matches its names to ours.
// No network and no database here, so all of it is tested. The fetching and saving are in fixtureSync.ts.

export interface Fixture {
  externalId: string;
  teamA: string;
  teamB: string;
  venueText: string | null;
  startUtc: string; // ISO, with Z
  name: string;
}

interface CricApiMatch {
  id?: string;
  name?: string;
  matchType?: string;
  venue?: string;
  dateTimeGMT?: string;
  teams?: string[];
  matchStarted?: boolean;
  matchEnded?: boolean;
}

// Upcoming men's-or-women's T20 matches with two named teams that have not started. Later steps keep only teams we have
// history for (the men's T20I list), so women's and domestic matches drop out there.
export function parseCricApiMatches(body: unknown, now: Date): { fixtures: Fixture[]; problem?: string } {
  const b = body as { status?: string; reason?: string; data?: CricApiMatch[] } | null;
  if (!b || b.status !== "success" || !Array.isArray(b.data)) {
    return { fixtures: [], problem: b?.reason ? `CricAPI said: ${b.reason}` : "CricAPI sent an answer we could not read." };
  }
  const out: Fixture[] = [];
  for (const m of b.data) {
    if (!m.id || (m.matchType ?? "").toLowerCase() !== "t20") continue;
    if (!Array.isArray(m.teams) || m.teams.length !== 2 || !m.teams[0] || !m.teams[1]) continue;
    if (m.matchStarted === true || m.matchEnded === true) continue;
    if (!m.dateTimeGMT) continue;
    const iso = /Z|[+-]\d\d:?\d\d$/.test(m.dateTimeGMT) ? m.dateTimeGMT : `${m.dateTimeGMT}Z`; // CricAPI sends GMT without the Z
    const t = new Date(iso);
    if (Number.isNaN(t.getTime()) || t.getTime() <= now.getTime()) continue;
    out.push({ externalId: m.id, teamA: m.teams[0].trim(), teamB: m.teams[1].trim(), venueText: m.venue?.trim() || null, startUtc: t.toISOString(), name: m.name ?? `${m.teams[0]} v ${m.teams[1]}` });
  }
  return { fixtures: out.sort((a, b) => a.startUtc.localeCompare(b.startUtc)) };
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Names the feed and Cricsheet spell differently. Anything not here must match exactly (ignoring case and punctuation).
const TEAM_ALIASES: Record<string, string> = {
  usa: "united states of america",
  "united states": "united states of america",
  uae: "united arab emirates",
  png: "papua new guinea",
};

export function matchTeam(feedName: string, teams: { id: number; name: string }[]): number | null {
  const want = norm(feedName);
  const target = TEAM_ALIASES[want] ?? want;
  return teams.find((t) => norm(t.name) === target)?.id ?? null;
}

// Venue: exact label first, then name, then one containing the other (only when exactly one ground fits).
// No match means "venue unknown", which the model handles (no venue effect), never a guess.
export function matchVenue(text: string | null, venues: { id: number; name: string; city: string | null }[]): number | null {
  if (!text) return null;
  const want = norm(text);
  const label = (v: { name: string; city: string | null }) => norm(v.city && !norm(v.name).includes(norm(v.city)) ? `${v.name} ${v.city}` : v.name);
  const exact = venues.filter((v) => label(v) === want || norm(v.name) === want);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const partial = venues.filter((v) => {
    const n = norm(v.name);
    return n.length >= 8 && (want.includes(n) || (want.length >= 8 && n.includes(want)));
  });
  return partial.length === 1 ? partial[0].id : null;
}
