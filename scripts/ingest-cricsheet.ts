// Loads men's T20 matches from Cricsheet into Supabase.
// Runs outside Vercel:  npm run ingest:cricsheet -- [--dataset t20s|ipl|sma] [--since 2021-01-01] [--limit 50] [--refresh]
//   --dataset  which Cricsheet file: t20s = men's T20 internationals (default),
//              ipl = Indian Premier League, sma = Syed Mushtaq Ali Trophy (Indian domestic T20)
//   --since    only matches on or after this date (default 2021-01-01)
//   --limit    stop after this many matches (for quick trial runs)
//   --refresh  download and unpack the Cricsheet zip again

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMatch, type CsMatch, type ParsedMatch } from "../src/lib/cricsheet";

// Each dataset becomes its own league. Only the international one decides a player's national team.
const DATASETS = {
  t20s: { zip: "t20s_json.zip", league: "Men's T20I", tier: "international" },
  ipl: { zip: "ipl_json.zip", league: "Indian Premier League", tier: "franchise" },
  sma: { zip: "sma_json.zip", league: "Syed Mushtaq Ali Trophy", tier: "domestic" },
} as const;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const datasetName = (option("dataset") ?? "t20s") as keyof typeof DATASETS;
const dataset = DATASETS[datasetName];
if (!dataset) throw new Error(`Unknown dataset "${datasetName}". Use one of: ${Object.keys(DATASETS).join(", ")}`);
const ZIP_URL = `https://cricsheet.org/downloads/${dataset.zip}`;
const JSON_DIR = join(process.cwd(), "data", "cricsheet", datasetName, "json");
const LEAGUE_NAME = dataset.league;
const since = option("since") ?? "2021-01-01";
const limit = option("limit") ? Number(option("limit")) : Infinity;

const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

function connect(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Supabase returns at most 1000 rows per request, so read big tables page by page.
async function fetchAll(db: SupabaseClient, table: string, columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) return rows;
  }
}

// ---------- Step 1: get the raw files ----------
async function ensureRawFiles() {
  const have = existsSync(JSON_DIR) && readdirSync(JSON_DIR).length > 0;
  if (have && !flag("refresh")) {
    console.log(`Using the ${readdirSync(JSON_DIR).length} match files already in data/cricsheet/json`);
    return;
  }
  mkdirSync(JSON_DIR, { recursive: true });
  console.log(`Downloading ${ZIP_URL} ...`);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  console.log(`Downloaded ${(zip.length / 1e6).toFixed(1)} MB. Unpacking...`);

  const names: string[] = [];
  unzipSync(zip, { filter: (f) => (names.push(f.name), false) });
  // Only plain "12345.json" files; ignore README, LICENSE and anything with a path in its name.
  const matchFiles = names.filter((n) => /^[0-9]+\.json$/.test(n));
  for (const group of chunk(matchFiles, 300)) {
    const wanted = new Set(group);
    const files = unzipSync(zip, { filter: (f) => wanted.has(f.name) });
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(JSON_DIR, name), bytes);
  }
  console.log(`Unpacked ${matchFiles.length} match files.`);
}

// ---------- Step 2: read and filter ----------
function loadMatches(): { id: string; parsed: ParsedMatch }[] {
  const out: { id: string; parsed: ParsedMatch }[] = [];
  for (const file of readdirSync(JSON_DIR)) {
    const raw = JSON.parse(readFileSync(join(JSON_DIR, file), "utf-8")) as CsMatch;
    if (raw.info.gender !== "male" || raw.info.dates[0] < since) continue;
    out.push({ id: file.replace(".json", ""), parsed: parseMatch(raw) });
  }
  out.sort((a, b) => a.parsed.date.localeCompare(b.parsed.date) || a.id.localeCompare(b.id));
  return out.slice(0, limit);
}

// ---------- Step 3: write to Supabase ----------
async function main() {
  const db = connect();
  const { data: run, error: runErr } = await db
    .from("ingestion_runs")
    .insert({ source: "cricsheet", notes: `since ${since}` })
    .select("id")
    .single();
  if (runErr) throw new Error(`ingestion_runs: ${runErr.message}`);

  try {
    await ensureRawFiles();
    const matches = loadMatches();
    console.log(`${matches.length} men's matches since ${since} (${matches[0]?.parsed.date} to ${matches.at(-1)?.parsed.date})`);
    let rowsWritten = 0;

    // League
    const leagueRes = await db
      .from("leagues")
      .upsert({ name: LEAGUE_NAME, gender: "male", tier: dataset.tier }, { onConflict: "name" })
      .select("id")
      .single();
    if (leagueRes.error) throw new Error(`leagues: ${leagueRes.error.message}`);
    const leagueId = leagueRes.data.id as number;

    // Teams and venues: create the ones that are missing, remember every id.
    const teamIds = new Map<string, number>();
    for (const t of await fetchAll(db, "teams", "id,name,league_id"))
      if (t.league_id === leagueId) teamIds.set(t.name as string, t.id as number);
    const newTeams = [...new Set(matches.flatMap((m) => m.parsed.teams))].filter((n) => !teamIds.has(n));
    for (const group of chunk(newTeams, 200)) {
      const { data, error } = await db.from("teams").insert(group.map((name) => ({ name, league_id: leagueId }))).select("id,name");
      if (error) throw new Error(`teams: ${error.message}`);
      for (const t of data) teamIds.set(t.name, t.id);
      rowsWritten += data.length;
    }

    const venueKey = (name: string, city: string | null) => `${name}|${city ?? ""}`;
    const venueIds = new Map<string, number>();
    for (const v of await fetchAll(db, "venues", "id,name,city")) venueIds.set(venueKey(v.name as string, v.city as string | null), v.id as number);
    const newVenues = new Map<string, { name: string; city: string | null }>();
    for (const { parsed: p } of matches)
      if (p.venue && !venueIds.has(venueKey(p.venue, p.city))) newVenues.set(venueKey(p.venue, p.city), { name: p.venue, city: p.city });
    for (const group of chunk([...newVenues.values()], 200)) {
      const { data, error } = await db.from("venues").insert(group).select("id,name,city");
      if (error) throw new Error(`venues: ${error.message}`);
      for (const v of data) venueIds.set(venueKey(v.name, v.city), v.id);
      rowsWritten += data.length;
    }

    // Players: for the international dataset a player's team is the most recent national team seen
    // (matches are in date order). Franchise and domestic datasets never touch team_id, so
    // "India" is not overwritten by "Mumbai Indians".
    const playerTeam = new Map<string, { name: string; team: string }>();
    for (const { parsed: p } of matches) for (const l of p.lines) playerTeam.set(l.cricsheetId, { name: l.name, team: l.team });
    const playerIds = new Map<string, number>();
    const playerRows = [...playerTeam].map(([cricsheet_id, v]) =>
      dataset.tier === "international"
        ? { cricsheet_id, name: v.name, team_id: teamIds.get(v.team) ?? null }
        : { cricsheet_id, name: v.name },
    );
    for (const group of chunk(playerRows, 500)) {
      const { data, error } = await db.from("players").upsert(group, { onConflict: "cricsheet_id" }).select("id,cricsheet_id");
      if (error) throw new Error(`players: ${error.message}`);
      for (const p of data) playerIds.set(p.cricsheet_id, p.id);
      rowsWritten += data.length;
    }
    console.log(`Teams ${teamIds.size}, venues ${venueIds.size}, players ${playerIds.size}`);

    // Matches
    const matchDbIds = new Map<string, number>();
    const matchRows = matches.map(({ id, parsed: p }) => ({
      cricsheet_match_id: id,
      league_id: leagueId,
      venue_id: p.venue ? venueIds.get(venueKey(p.venue, p.city)) ?? null : null,
      team_a: teamIds.get(p.teams[0]),
      team_b: teamIds.get(p.teams[1]),
      start_time: `${p.date}T00:00:00Z`, // Cricsheet gives a date only, not a time
      status: "completed",
      toss_winner: p.tossWinner ? teamIds.get(p.tossWinner) ?? null : null,
      toss_decision: p.tossDecision,
      data_origin: "ingested",
    }));
    for (const group of chunk(matchRows, 500)) {
      const { data, error } = await db.from("matches").upsert(group, { onConflict: "cricsheet_match_id" }).select("id,cricsheet_match_id");
      if (error) throw new Error(`matches: ${error.message}`);
      for (const m of data) matchDbIds.set(m.cricsheet_match_id, m.id);
      rowsWritten += data.length;
    }
    console.log(`Matches written: ${matchDbIds.size}`);

    // One stats row per player per match
    const lineRows = matches.flatMap(({ id, parsed: p }) =>
      p.lines.map((l) => ({
        match_id: matchDbIds.get(id),
        player_id: playerIds.get(l.cricsheetId),
        team_id: teamIds.get(l.team) ?? null,
        stats_json: l.stats,
        phases_json: l.phases,
        data_origin: "ingested",
      })),
    );
    let done = 0;
    for (const group of chunk(lineRows, 500)) {
      const { error } = await db.from("player_match_lines").upsert(group, { onConflict: "match_id,player_id" });
      if (error) throw new Error(`player_match_lines: ${error.message}`);
      done += group.length;
      rowsWritten += group.length;
      if (done % 5000 < 500) console.log(`  stats rows: ${done}/${lineRows.length}`);
    }

    await db.from("ingestion_runs").update({ status: "ok", finished_at: new Date().toISOString(), rows_written: rowsWritten }).eq("id", run.id);
    console.log(`Done. ${rowsWritten} rows written.`);
  } catch (err) {
    await db.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), notes: String(err).slice(0, 500) }).eq("id", run.id);
    throw err;
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
