// Data for the setup screen of an upcoming match: each side's likely players, who is ticked as playing, credits so far.
// SERVER ONLY (uses the secret key).

import { RUBRIC } from "@/config/rubric";
import { serverDb } from "./db";
import { recentXI } from "./livePipeline";

export interface SetupPlayer {
  id: number;
  name: string;
  played: number; // of the side's last few matches in this league
  added: boolean; // typed in by Aryan, not in the recent XIs
  inXI: boolean;
  credit: number | null; // typed by Aryan (real Dream11)
  seededCredit: number | null; // the agent's own estimate, shown only as a hint
}

export interface SetupTeam {
  teamId: number;
  name: string;
  recentMatches: number;
  players: SetupPlayer[];
}

export interface SetupData {
  cricsheetId: string;
  matchId: number;
  startTime: string;
  locked: boolean; // the match has started
  teams: SetupTeam[];
}

export async function loadSetup(cricsheetId: string): Promise<SetupData | null> {
  const db = serverDb();
  const { data: m } = await db.from("matches").select("id, start_time, team_a, team_b, data_origin, league_id").eq("cricsheet_match_id", cricsheetId).maybeSingle();
  if (!m || m.data_origin !== "manual") return null;
  const date = String(m.start_time).slice(0, 10);
  const n = RUBRIC.availability.lastXIs.value;

  const [{ data: teams }, { data: xi }, { data: credits }] = await Promise.all([
    db.from("teams").select("id, name").in("id", [m.team_a, m.team_b]),
    db.from("predicted_xi").select("player_id, team_id, source, confidence").eq("match_id", m.id),
    db.from("credits").select("player_id, credits, source").eq("match_id", m.id),
  ]);
  const typed = (credits ?? []).filter((c) => c.source === "manual");
  const creditOf = new Map(typed.map((c) => [c.player_id as number, Number(c.credits)]));
  const seededOf = new Map((credits ?? []).filter((c) => c.source === "seeded").map((c) => [c.player_id as number, Number(c.credits)]));

  const out: SetupTeam[] = [];
  for (const teamId of [m.team_a as number, m.team_b as number]) {
    const recent = await recentXI(db, teamId, date, n, m.league_id as number);
    const stored = (xi ?? []).filter((x) => x.team_id === teamId);
    const added = stored.filter((x) => x.source === "predicted" && x.confidence === null).map((x) => x.player_id as number);
    const ids = [...new Set([...recent.counts.keys(), ...added, ...stored.filter((x) => x.source === "confirmed").map((x) => x.player_id as number)])];
    const { data: people } = await db.from("players").select("id, name").in("id", ids.length ? ids : [0]);
    const nameOf = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));
    const confirmed = new Set(stored.filter((x) => x.source === "confirmed").map((x) => x.player_id as number));
    out.push({
      teamId,
      name: (teams ?? []).find((t) => t.id === teamId)?.name ?? "?",
      recentMatches: recent.matches,
      players: ids
        .map((id) => ({ id, name: nameOf.get(id) ?? String(id), played: recent.counts.get(id) ?? 0, added: !recent.counts.has(id), inXI: confirmed.has(id), credit: creditOf.get(id) ?? null, seededCredit: seededOf.get(id) ?? null }))
        .sort((a, b) => b.played - a.played || a.name.localeCompare(b.name)),
    });
  }
  return { cricsheetId, matchId: m.id, startTime: String(m.start_time), locked: new Date(m.start_time).getTime() <= Date.now(), teams: out };
}
