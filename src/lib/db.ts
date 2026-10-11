import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRow } from "./history";
import type { StatsNoRole } from "./inferRole";

// Server-side only: uses the secret key. Never import this into browser code.
export function serverDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Every stats row for matches on or after fromDate and strictly before beforeDate.
// "Strictly before" is what keeps a backtest honest: the match being predicted can never be in its own history.
export async function loadHistoryRows(db: SupabaseClient, fromDate: string, beforeDate: string): Promise<HistoryRow[]> {
  const out: HistoryRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("player_match_lines")
      .select("player_id, match_id, team_id, stats_json, phases_json, matches!inner(start_time, venue_id, leagues!inner(tier))")
      .gte("matches.start_time", `${fromDate}T00:00:00Z`)
      .lt("matches.start_time", `${beforeDate}T00:00:00Z`)
      .order("match_id")
      .order("player_id")
      .range(start, start + 999);
    if (error) throw new Error(`history: ${error.message}`);
    for (const r of data as unknown as {
      player_id: number;
      match_id: number;
      team_id: number | null;
      stats_json: StatsNoRole;
      phases_json: HistoryRow["phases"] | null;
      matches: { start_time: string; venue_id: number | null; leagues: { tier: string } };
    }[]) {
      out.push({
        playerId: r.player_id,
        matchId: r.match_id,
        date: r.matches.start_time.slice(0, 10),
        leagueTier: r.matches.leagues.tier,
        teamId: r.team_id,
        venueId: r.matches.venue_id,
        stats: r.stats_json,
        phases: r.phases_json ?? undefined,
      });
    }
    if (data.length < 1000) return out;
  }
}

export { monthsBefore } from "./dates";
