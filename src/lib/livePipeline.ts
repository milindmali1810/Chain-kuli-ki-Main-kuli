// The live path for an upcoming match: who is likely to play, and "pick my team".
// Same engine as the backtest (predict()), but credits are the REAL Dream11 ones Aryan typed, and there is no
// scorecard, so nothing here can know the actual points. SERVER ONLY (uses the secret key).

import type { SupabaseClient } from "@supabase/supabase-js";
import { POINTS_PROFILES, DEFAULT_POINTS_PROFILE } from "@/config/points";
import { RUBRIC } from "@/config/rubric";
import { DEFAULT_RULES_PROFILE, RULES_PROFILES, type Role } from "@/config/rules";
import { loadActiveRubric, loadHistoryRows, monthsBefore } from "./db";
import { inferRolesFromRows, type StatsNoRole } from "./inferRole";
import { predict, type PoolPlayer } from "./predict";

const WINDOW_MONTHS = 36;

// Players who were in a side's playing XI in its last few internationals before the match, with how many of those
// matches they played. This is the "predicted XI" until the real one is announced at the toss.
export async function recentXI(db: SupabaseClient, teamId: number, beforeDate: string, n: number): Promise<{ matches: number; counts: Map<number, number> }> {
  const { data: ms, error } = await db
    .from("matches")
    .select("id, start_time, leagues!inner(tier)")
    .or(`team_a.eq.${teamId},team_b.eq.${teamId}`)
    .eq("leagues.tier", "international")
    .lt("start_time", `${beforeDate}T00:00:00Z`)
    .order("start_time", { ascending: false })
    .limit(n);
  if (error) throw new Error(`recent matches: ${error.message}`);
  const ids = (ms ?? []).map((m) => m.id as number);
  const counts = new Map<number, number>();
  if (ids.length === 0) return { matches: 0, counts };
  const { data: lines, error: lErr } = await db.from("player_match_lines").select("player_id, stats_json").in("match_id", ids).eq("team_id", teamId);
  if (lErr) throw new Error(`recent lines: ${lErr.message}`);
  for (const l of lines ?? []) if ((l.stats_json as StatsNoRole).inPlayingXI) counts.set(l.player_id, (counts.get(l.player_id) ?? 0) + 1);
  return { matches: ids.length, counts };
}

export interface PickResult {
  stage: "provisional" | "final";
  picked: number;
  excluded: { name: string; reason: string }[];
  message: string;
}

// Predict and store the recommended team for an upcoming match. The confirmed XI (both sides, 11 each) gives the
// "final" stage; without it the "provisional" stage is built from the predicted XIs. Re-running replaces only this
// rubric version's recommendation for that stage.
export async function pickTeamForMatch(db: SupabaseClient, cricsheetId: string): Promise<PickResult> {
  const { data: match, error } = await db.from("matches").select("id, start_time, venue_id, team_a, team_b").eq("cricsheet_match_id", cricsheetId).single();
  if (error) throw new Error(`match ${cricsheetId}: ${error.message}`);
  const date = String(match.start_time).slice(0, 10);
  const matchTeamIds: [number, number] = [match.team_a, match.team_b];

  const active = await loadActiveRubric(db);
  if (!active) throw new Error("No rubric version is active. Run a backtest first.");
  const cfg = active.cfg ?? RUBRIC;
  const rules = RULES_PROFILES[DEFAULT_RULES_PROFILE];
  const points = POINTS_PROFILES[DEFAULT_POINTS_PROFILE];

  const { data: xi } = await db.from("predicted_xi").select("player_id, team_id, source, confidence").eq("match_id", match.id);
  const { data: creditRows } = await db.from("credits").select("player_id, credits").eq("match_id", match.id);
  const credits = new Map((creditRows ?? []).map((c) => [c.player_id as number, Number(c.credits)]));

  const confirmed: PoolPlayer[] = (xi ?? []).filter((x) => x.source === "confirmed").map((x) => ({ playerId: x.player_id, teamId: x.team_id, pPlay: 1 }));
  const haveConfirmed = matchTeamIds.every((t) => confirmed.filter((p) => p.teamId === t).length === 11);
  const stage: "provisional" | "final" = haveConfirmed ? "final" : "provisional";
  // Players Aryan added by hand have no confidence: he said they are likely to play, so they count as playing.
  const predicted: PoolPlayer[] = (xi ?? [])
    .filter((x) => x.source === "predicted" && (x.confidence === null || Number(x.confidence) >= cfg.availability.provisionalMin.value))
    .map((x) => ({ playerId: x.player_id, teamId: x.team_id, pPlay: x.confidence === null ? 1 : Number(x.confidence) }));
  const pool = haveConfirmed ? confirmed : predicted;
  if (pool.length === 0) throw new Error("There are no players for this match yet. Add the squad first.");

  const rows = await loadHistoryRows(db, monthsBefore(date, WINDOW_MONTHS), date);
  const roles = inferRolesFromRows(rows);
  const { data: overrides } = await db.from("manual_overrides").select("entity_id, value").eq("entity_type", "player").eq("field", "role");
  for (const o of overrides ?? []) if (["WK", "BAT", "AR", "BOWL"].includes(o.value)) roles.set(o.entity_id, o.value as Role);

  const { data: teams } = await db.from("teams").select("id, name").in("id", matchTeamIds);
  const teamNames = new Map((teams ?? []).map((t) => [t.id as number, t.name as string]));
  const poolIds = pool.map((p) => p.playerId);
  const { data: people } = await db.from("players").select("id, name").in("id", poolIds);
  const names = new Map((people ?? []).map((p) => [p.id as number, p.name as string]));

  const p = predict({ stage, asOfDate: date, rows, roles, names, teamNames, matchTeamIds, venueId: match.venue_id as number | null, pool, credits, rules, cfg, points });
  if (!p.selection || !p.captains) {
    return { stage, picked: 0, excluded: p.excluded.map((e) => ({ name: e.name, reason: e.reason })), message: `No legal team could be built. ${p.notes.join(" ")}`.trim() };
  }

  await db.from("recommendations").delete().eq("match_id", match.id).eq("rubric_version_id", active.id).eq("stage", stage);
  const rec = await db
    .from("recommendations")
    .insert({
      match_id: match.id, rubric_version_id: active.id, stage, captain_id: p.captains.captainId, vc_id: p.captains.viceCaptainId,
      captain_scores_json: p.captains.scores,
      engine_notes_json: {
        deathLog: p.deathLog, notes: p.notes, unavailableFactors: p.unavailableFactors, validation: p.validation,
        rulesProfile: p.rulesProfile, rubricVersion: p.rubricVersion, totalCredits: p.selection.totalCredits, creditsSource: "manual",
        excluded: p.excluded,
      },
      captain_reason: null, vc_reason: null, summary_text: null, // written by explainMatch
    })
    .select("id")
    .single();
  if (rec.error) throw new Error(`recommendations: ${rec.error.message}`);
  const ins = await db.from("recommendation_players").insert(
    p.selected.map((s, idx) => ({
      recommendation_id: rec.data.id, player_id: s.candidate.id, slot: "starter", rank: idx + 1, expected_points: s.candidate.expected,
      factors_json: { ...s.factors, credits: s.candidate.credits, creditsSource: "manual", rulesProfile: p.rulesProfile, rubric: p.rubricVersion },
      reason_text: null,
    })),
  );
  if (ins.error) throw new Error(`recommendation_players: ${ins.error.message}`);
  await db.from("match_context").upsert({ match_id: match.id, pitch_tags_json: { ...p.pitch, teamForm: p.teamForm, unavailableFactors: p.unavailableFactors } }, { onConflict: "match_id" });

  return {
    stage,
    picked: p.selected.length,
    excluded: p.excluded.map((e) => ({ name: e.name, reason: e.reason })),
    message: `The ${stage === "final" ? "final" : "provisional"} team is ready.`,
  };
}
