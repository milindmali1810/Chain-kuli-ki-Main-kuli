import type { Role } from "@/config/rules";
import { monthsBefore, serverDb } from "./db";
import { editMode, type EditMode, type EditorPlayer } from "./editorLogic";
import { inferRolesFromRows, type StatsNoRole } from "./inferRole";
import { scorePlayerMatch, type PlayerMatchStats } from "./scorePlayerMatch";

// Server-side data for the "edit and confirm my team" screen. SERVER ONLY (uses the secret key).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface EditorData {
  matchId: number;
  cricsheetId: string;
  startTime: string;
  mode: EditMode;
  pool: EditorPlayer[];
  unavailable: { name: string; reason: string }[];
  agent: { stage: "final" | "provisional"; ids: number[]; captainId: number | null; viceId: number | null } | null;
  saved: { ids: number[]; captainId: number | null; viceId: number | null; confirmedAt: string } | null;
  // Real points per player once the match has been played (real Dream11 points win over scorecard-computed ones).
  actualById: Record<number, number> | null;
}

export async function loadEditorData(cricsheetId: string): Promise<EditorData | null> {
  const db = serverDb();
  const { data: m } = await db.from("matches").select("id, cricsheet_match_id, start_time").eq("cricsheet_match_id", cricsheetId).maybeSingle();
  if (!m) return null;
  const date = String(m.start_time).slice(0, 10);

  const [{ data: recs }, { data: xi }, { data: credits }, { data: actualRows }, { data: savedRow }, { data: teams }] = await Promise.all([
    db.from("recommendations").select("id, stage, captain_id, vc_id").eq("match_id", m.id).order("id"),
    db.from("predicted_xi").select("player_id, team_id").eq("match_id", m.id),
    db.from("credits").select("player_id, credits").eq("match_id", m.id),
    db.from("actual_points").select("player_id, points, source").eq("match_id", m.id),
    db.from("user_teams").select("players_json, captain_id, vc_id, confirmed_at").eq("match_id", m.id).maybeSingle(),
    db.from("teams").select("id, name"),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));
  const creditOf = new Map((credits ?? []).map((c) => [c.player_id, Number(c.credits)]));
  const ids = [...new Set((xi ?? []).map((x) => x.player_id as number))];
  const teamOf = new Map((xi ?? []).map((x) => [x.player_id as number, teamName.get(x.team_id) ?? "?"]));

  // The agent's team: the final stage if there is one, otherwise the provisional one (latest version of each).
  const latest = new Map<string, Row>();
  for (const r of recs ?? []) latest.set(r.stage, r);
  const rec = latest.get("final") ?? latest.get("provisional");
  let agent: EditorData["agent"] = null;
  if (rec) {
    const { data: rp } = await db.from("recommendation_players").select("player_id").eq("recommendation_id", rec.id);
    agent = { stage: rec.stage, ids: (rp ?? []).map((p) => p.player_id), captainId: rec.captain_id ?? null, viceId: rec.vc_id ?? null };
  }

  // Names, and roles worked out AS OF the match date from the same history the agent used (manual overrides win).
  const { data: people } = await db.from("players").select("id, name").in("id", ids.length ? ids : [0]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name as string]));
  const rows: { playerId: number; stats: StatsNoRole }[] = [];
  for (let start = 0; ids.length; start += 1000) {
    const { data, error } = await db
      .from("player_match_lines")
      .select("player_id, stats_json, matches!inner(start_time)")
      .in("player_id", ids)
      .gte("matches.start_time", `${monthsBefore(date, 36)}T00:00:00Z`)
      .lt("matches.start_time", `${date}T00:00:00Z`)
      .order("match_id")
      .order("player_id")
      .range(start, start + 999);
    if (error) throw new Error(`roles: ${error.message}`);
    for (const r of data ?? []) rows.push({ playerId: r.player_id, stats: r.stats_json as StatsNoRole });
    if ((data ?? []).length < 1000) break;
  }
  const roles = inferRolesFromRows(rows);
  const { data: overrides } = await db.from("manual_overrides").select("entity_id, value").eq("entity_type", "player").eq("field", "role");
  for (const o of overrides ?? []) if (["WK", "BAT", "AR", "BOWL"].includes(o.value)) roles.set(o.entity_id, o.value as Role);

  const pool: EditorPlayer[] = [];
  const unavailable: EditorData["unavailable"] = [];
  for (const id of ids) {
    const name = nameOf.get(id) ?? String(id);
    const role = roles.get(id);
    const credit = creditOf.get(id);
    if (!role) unavailable.push({ name, reason: "role unavailable (too little recent history; set it on the Data screen)" });
    else if (credit === undefined) unavailable.push({ name, reason: "credits unavailable" });
    else pool.push({ id, name, team: teamOf.get(id) ?? "?", role, credits: credit });
  }
  pool.sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));

  // Actual points for every pool player (needed to compare a team Aryan edited with the agent's team).
  let actualById: EditorData["actualById"] = null;
  if ((actualRows ?? []).length > 0) {
    actualById = {};
    const manual = new Map<number, number>();
    const computed = new Map<number, number>();
    for (const a of actualRows ?? []) (a.source === "dream11_manual" ? manual : computed).set(a.player_id, Number(a.points));
    const { data: lines } = await db.from("player_match_lines").select("player_id, stats_json").eq("match_id", m.id).in("player_id", ids.length ? ids : [0]);
    const lineOf = new Map((lines ?? []).map((l) => [l.player_id as number, l.stats_json as StatsNoRole]));
    for (const p of pool) {
      if (manual.has(p.id)) actualById[p.id] = manual.get(p.id)!;
      else if (computed.has(p.id)) actualById[p.id] = computed.get(p.id)!;
      else {
        const stats = lineOf.get(p.id);
        // Not in the line-up at all means he did not play: 0 points.
        actualById[p.id] = stats ? scorePlayerMatch({ role: p.role, ...stats } as PlayerMatchStats).total : 0;
      }
    }
  }

  const saved = savedRow
    ? { ids: ((savedRow.players_json as Row)?.ids ?? []) as number[], captainId: savedRow.captain_id ?? null, viceId: savedRow.vc_id ?? null, confirmedAt: savedRow.confirmed_at as string }
    : null;

  return {
    matchId: m.id,
    cricsheetId: m.cricsheet_match_id,
    startTime: String(m.start_time),
    mode: editMode(new Date(), String(m.start_time), (actualRows ?? []).length > 0),
    pool,
    unavailable,
    agent,
    saved,
    actualById,
  };
}
