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

// CricAPI sometimes labels T20Is as "odi" (seen on the West Indies tour of India), so the match name counts too:
// "4th T20I" is a T20 whatever the type field says. A name that says ODI or Test never is.
export function isT20(m: CricApiMatch): boolean {
  const name = m.name ?? "";
  if (/\b(ODI|Test)\b/i.test(name)) return false;
  return (m.matchType ?? "").toLowerCase() === "t20" || /\bT20I?\b/i.test(name);
}

// Upcoming T20 matches with two named teams that have not started. "Tbc vs Tbc" placeholders and later steps (team and
// ground matching) drop anything we cannot place.
export function upcomingFromList(list: unknown, now: Date): Fixture[] {
  if (!Array.isArray(list)) return [];
  const out: Fixture[] = [];
  for (const m of list as CricApiMatch[]) {
    if (!m || !m.id || !isT20(m)) continue;
    if (!Array.isArray(m.teams) || m.teams.length !== 2 || !m.teams[0] || !m.teams[1]) continue;
    if (m.matchStarted === true || m.matchEnded === true) continue;
    if (!m.dateTimeGMT) continue;
    const iso = /Z|[+-]\d\d:?\d\d$/.test(m.dateTimeGMT) ? m.dateTimeGMT : `${m.dateTimeGMT}Z`; // CricAPI sends GMT without the Z
    const t = new Date(iso);
    if (Number.isNaN(t.getTime()) || t.getTime() <= now.getTime()) continue;
    out.push({ externalId: m.id, teamA: m.teams[0].trim(), teamB: m.teams[1].trim(), venueText: m.venue?.trim() || null, startUtc: t.toISOString(), name: m.name ?? `${m.teams[0]} v ${m.teams[1]}` });
  }
  return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

// The answer of /series_info: { status, data: { matchList: [...] } }.
export function parseSeriesInfo(body: unknown, now: Date): { fixtures: Fixture[]; problem?: string } {
  const b = body as { status?: string; reason?: string; data?: { matchList?: unknown } } | null;
  if (!b || b.status !== "success") return { fixtures: [], problem: b?.reason ? `CricAPI said: ${b.reason}` : "CricAPI sent an answer we could not read." };
  return { fixtures: upcomingFromList(b.data?.matchList, now) };
}

// ---------- Which series to look into ----------
// Upcoming matches are only reachable through their series, and every call counts against a small daily quota, so only
// series that include T20s, have their matches published, and are running now or start soon are opened.

export interface SeriesRow {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  t20?: number;
  matches?: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Dates arrive as "2026-10-22" or, for the end, as "Dec 01" (year left out). Series that start without a year are
// skipped: they are the unpublished duplicates (no matches loaded), never the real running ones.
function seriesWindow(s: SeriesRow): { start: number; end: number } | null {
  const sm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.startDate ?? "");
  if (!sm) return null;
  const start = Date.UTC(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
  let end: number | null = null;
  const em = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.endDate ?? "");
  if (em) end = Date.UTC(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  else {
    const ed = /^([A-Za-z]{3}) (\d{1,2})$/.exec(s.endDate ?? "");
    const mi = ed ? MONTHS.indexOf(ed[1].toLowerCase()) : -1;
    if (ed && mi >= 0) {
      end = Date.UTC(Number(sm[1]), mi, Number(ed[2]));
      if (end < start) end = Date.UTC(Number(sm[1]) + 1, mi, Number(ed[2])); // a Jan end after a Dec start
    }
  }
  return end === null ? null : { start, end };
}

export function pickSeries(rows: SeriesRow[], now: Date, opts: { lookaheadDays?: number; max?: number } = {}): string[] {
  const ahead = now.getTime() + (opts.lookaheadDays ?? 45) * 86400_000;
  const behind = now.getTime() - 86400_000;
  return rows
    .filter((s) => (s.t20 ?? 0) > 0 && (s.matches ?? 0) > 0)
    .map((s) => ({ s, w: seriesWindow(s) }))
    .filter((x): x is { s: SeriesRow; w: { start: number; end: number } } => x.w !== null && x.w.start <= ahead && x.w.end >= behind)
    .sort((a, b) => a.w.start - b.w.start)
    .slice(0, opts.max ?? 8)
    .map((x) => x.s.id);
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

// Venue: exact label first, then name, then one containing the other, then the same words in a different order or with
// extras (the feed says "Rajiv Gandhi International Stadium, Hyderabad", our data says "..., Uppal, Hyderabad").
// The first step that finds anything decides. The history holds some grounds twice (e.g. "Eden Park" and "Eden Park,
// Auckland"): several hits in the SAME city are duplicates of one ground, so the one with the most matches on record is
// taken. Hits in different cities, or no hit, mean "venue unknown", which the model handles (no venue effect). Never a guess.
export interface VenueRow {
  id: number;
  name: string;
  city: string | null;
  matches?: number; // matches on record at this ground, used only to choose between duplicates
}

export function matchVenue(text: string | null, venues: VenueRow[]): number | null {
  if (!text) return null;
  const want = norm(text);
  const wantTokens = want.split(" ").filter(Boolean);
  const label = (v: VenueRow) => norm(v.city && !norm(v.name).includes(norm(v.city)) ? `${v.name} ${v.city}` : v.name);

  const tiers: VenueRow[][] = [
    venues.filter((v) => label(v) === want || norm(v.name) === want),
    venues.filter((v) => {
      const n = norm(v.name);
      return n.length >= 8 && (want.includes(n) || (want.length >= 8 && n.includes(want)));
    }),
    venues.filter((v) => {
      const have = new Set(`${norm(v.name)} ${norm(v.city ?? "")}`.split(" ").filter(Boolean));
      const inGround = wantTokens.filter((t) => have.has(t)).length;
      return wantTokens.length >= 3 && inGround === wantTokens.length;
    }),
  ];
  for (const hits of tiers) {
    if (hits.length === 0) continue;
    if (hits.length === 1) return hits[0].id;
    const cities = new Set(hits.map((v) => norm(v.city ?? "")));
    if (cities.size !== 1 || cities.has("")) return null; // different or unknown cities: do not guess
    return [...hits].sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0) || a.id - b.id)[0].id;
  }
  return null;
}
