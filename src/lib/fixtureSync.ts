// The upcoming-match finder. Asks CricAPI, series by series, for upcoming T20 matches, lists the ones we can predict (men's internationals
// we have history for), and has the agent build a team for each one that starts soon, so Aryan finds the match already
// listed with its team ready. SERVER ONLY (uses the secret key).

import type { SupabaseClient } from "@supabase/supabase-js";
import { explainMatch } from "./explainMatch";
import { matchTeam, matchVenue, parseSeriesInfo, pickSeries, type Fixture, type SeriesRow } from "./fixtures";
import { pickTeamForMatch } from "./livePipeline";

const API = "https://api.cricapi.com/v1";
const HORIZON_HOURS = 72; // build teams for matches starting within this long; later ones are listed but not built yet
const REFRESH_AFTER_HOURS = 20; // a provisional team is rebuilt after this long (new matches have been played since)

export interface SyncReport {
  problem?: string;
  found: number;
  added: number;
  updated: number;
  skipped: string[];
  prepared: { match: string; note: string }[];
}

export interface SyncOptions {
  apiKey?: string;
  now?: Date;
  budgetMs?: number; // stop starting new teams after this long (serverless time limit)
  fetchImpl?: (url: string) => Promise<unknown>; // injectable: tests and the sample run never touch the network
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function syncFixtures(db: SupabaseClient, opts: SyncOptions = {}): Promise<SyncReport> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const budget = opts.budgetMs ?? 100_000;
  const report: SyncReport = { found: 0, added: 0, updated: 0, skipped: [], prepared: [] };

  // 1. Ask the feed. Two lists (current and the latest matches) so a match listed in only one is not missed.
  const get = opts.fetchImpl ?? getJson;
  const fixtures = new Map<string, Fixture>();
  if (!opts.apiKey) return { ...report, problem: "No fixture feed key is set (CRICAPI_KEY), so the agent cannot look for new matches." };
  const key = encodeURIComponent(opts.apiKey);

  // Upcoming matches are only reachable through their series (the free "current matches" and "all matches" lists hold
  // live and finished ones). Read the newest three pages of the series list, open the few that matter, and read their matches.
  // About 3 + up to 8 calls a run, against a free quota of 100 a day.
  const seriesRows: SeriesRow[] = [];
  for (const offset of [0, 25, 50]) {
    type SeriesBody = { status?: string; reason?: string; data?: SeriesRow[] } | null;
    let body: SeriesBody;
    try {
      body = (await get(`${API}/series?apikey=${key}&offset=${offset}`)) as SeriesBody;
    } catch {
      return { ...report, problem: "The fixture feed could not be reached. Try again later." };
    }
    if (!body || body.status !== "success" || !Array.isArray(body.data)) {
      return { ...report, problem: body?.reason ? `CricAPI said: ${body.reason}` : "CricAPI sent an answer we could not read." };
    }
    seriesRows.push(...body.data);
  }
  for (const id of pickSeries(seriesRows, now)) {
    try {
      const parsed = parseSeriesInfo(await get(`${API}/series_info?apikey=${key}&id=${encodeURIComponent(id)}`), now);
      if (parsed.problem) report.problem = parsed.problem; // e.g. the daily quota ran out part-way: keep what we have
      for (const f of parsed.fixtures) fixtures.set(f.externalId, f);
    } catch {
      report.problem = "Some series could not be read. Try again later.";
    }
  }
  if (fixtures.size > 0) delete report.problem;
  report.found = fixtures.size;

  // 2. List the ones we can predict.
  const { data: league } = await db.from("leagues").select("id").eq("tier", "international").eq("gender", "male").limit(1).maybeSingle();
  if (!league) return { ...report, problem: "No men's international league in the data." };
  const [{ data: teams }, { data: venues }, { data: existing }] = await Promise.all([
    db.from("teams").select("id, name").eq("league_id", league.id),
    db.from("venues").select("id, name, city"),
    db.from("matches").select("id, external_id, start_time, team_a, team_b, venue_id").eq("data_origin", "manual"),
  ]);
  // Matches on record per ground, so that when the history holds one ground twice the busier row is used.
  const perVenue = new Map<number, number>();
  for (let from = 0; ; from += 1000) {
    const { data: vm } = await db.from("matches").select("venue_id").not("venue_id", "is", null).order("id").range(from, from + 999);
    for (const r of vm ?? []) perVenue.set(r.venue_id as number, (perVenue.get(r.venue_id as number) ?? 0) + 1);
    if ((vm ?? []).length < 1000) break;
  }
  const venueRows = (venues ?? []).map((v) => ({ ...v, matches: perVenue.get(v.id) ?? 0 }));
  const byExternal = new Map((existing ?? []).filter((m) => m.external_id).map((m) => [m.external_id as string, m]));

  for (const f of fixtures.values()) {
    const a = matchTeam(f.teamA, teams ?? []);
    const b = matchTeam(f.teamB, teams ?? []);
    if (a === null || b === null) {
      report.skipped.push(`${f.name}: not a men's international we have history for`);
      continue;
    }
    const known = byExternal.get(f.externalId);
    if (known) {
      // A changed start time, or a ground we could not place before and now can.
      const change: Record<string, unknown> = {};
      if (new Date(known.start_time).toISOString() !== f.startUtc) change.start_time = f.startUtc;
      if (known.venue_id === null) {
        const v = matchVenue(f.venueText, venueRows);
        if (v !== null) change.venue_id = v;
      }
      if (Object.keys(change).length > 0) {
        await db.from("matches").update(change).eq("id", known.id);
        report.updated += 1;
      }
      continue;
    }
    // The same match may have been added by hand earlier: adopt it instead of listing it twice.
    const twin = (existing ?? []).find((m) => !m.external_id && new Set([m.team_a, m.team_b]).size === 2 && [m.team_a, m.team_b].includes(a) && [m.team_a, m.team_b].includes(b) && Math.abs(new Date(m.start_time).getTime() - new Date(f.startUtc).getTime()) < 24 * 3600_000);
    if (twin) {
      await db.from("matches").update({ external_id: f.externalId, start_time: f.startUtc }).eq("id", twin.id);
      report.updated += 1;
      continue;
    }
    const ins = await db
      .from("matches")
      .insert({ league_id: league.id, venue_id: matchVenue(f.venueText, venueRows), team_a: a, team_b: b, start_time: f.startUtc, status: "scheduled", data_origin: "manual", external_id: f.externalId })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      if (!ins.error?.message.includes("duplicate")) report.skipped.push(`${f.name}: could not be saved`);
      continue; // a duplicate means another sync listed it a moment ago
    }
    await db.from("matches").update({ cricsheet_match_id: `live-${ins.data.id}` }).eq("id", ins.data.id);
    report.added += 1;
  }

  // 3. Build a team for every listed match starting soon that has none (or a stale provisional one).
  const soon = new Date(now.getTime() + HORIZON_HOURS * 3600_000).toISOString();
  const { data: upcoming } = await db
    .from("matches")
    .select("id, cricsheet_match_id, start_time")
    .eq("data_origin", "manual")
    .gt("start_time", now.toISOString())
    .lt("start_time", soon)
    .order("start_time");
  for (const m of upcoming ?? []) {
    if (Date.now() - started > budget) { report.prepared.push({ match: m.cricsheet_match_id, note: "left for the next check (time limit)" }); continue; }
    const { data: recs } = await db.from("recommendations").select("stage, created_at").eq("match_id", m.id);
    const hasFinal = (recs ?? []).some((r) => r.stage === "final");
    const newest = Math.max(0, ...(recs ?? []).map((r) => new Date(r.created_at).getTime()));
    const fresh = (recs ?? []).length > 0 && (hasFinal || now.getTime() - newest < REFRESH_AFTER_HOURS * 3600_000);
    if (fresh) continue;
    try {
      const r = await pickTeamForMatch(db, m.cricsheet_match_id);
      if (r.picked === 0) { report.prepared.push({ match: m.cricsheet_match_id, note: r.message }); continue; }
      // Gemini writes the reasons when there is time for it (about 35 s); otherwise the plain templates do.
      const timeLeft = budget - (Date.now() - started);
      await explainMatch(db, m.cricsheet_match_id, { useGemini: timeLeft > 45_000, apiKey: process.env.GEMINI_API_KEY, onlyStages: [r.stage] });
      report.prepared.push({ match: m.cricsheet_match_id, note: `${r.stage} team ready` });
    } catch (e) {
      report.prepared.push({ match: m.cricsheet_match_id, note: `could not build a team: ${e instanceof Error ? e.message : "unknown problem"}` });
    }
  }
  return report;
}
