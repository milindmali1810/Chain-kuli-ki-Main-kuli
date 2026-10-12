// Backtest: predict a match that has already been played, using ONLY data from before it,
// then compare with the real scorecard.
// Runs outside Vercel:  npm run backtest -- --match 1529230
//
//   provisional = built from predicted XIs (each side's last 5 internationals), before the toss
//   final       = built from the confirmed XI (public at the toss, so not a leak)
//   actual      = real points computed from the scorecard with scorePlayerMatch

import { POINTS_PROFILES, DEFAULT_POINTS_PROFILE } from "../src/config/points";
import { RUBRIC } from "../src/config/rubric";
import { DEFAULT_RULES_PROFILE, RULES_PROFILES } from "../src/config/rules";
import type { Role } from "../src/config/rules";
import { loadActiveRubric, loadHistoryRows, monthsBefore, serverDb } from "../src/lib/db";
import { seedCreditsFor } from "../src/lib/seedCredits";
import { inferRolesFromRows } from "../src/lib/inferRole";
import { teamScore } from "../src/lib/teamScore";
import { fieldStats } from "../src/lib/fieldStats";
import { predict, type PoolPlayer, type Prediction } from "../src/lib/predict";
import { scorePlayerMatch, type PlayerMatchStats } from "../src/lib/scorePlayerMatch";
import { selectTeam, type Candidate } from "../src/lib/selectTeam";
import type { StatsNoRole } from "../src/lib/inferRole";

const WINDOW_MONTHS = 36;
const args = process.argv.slice(2);
const i = args.indexOf("--match");
const cricsheetId = i >= 0 ? args[i + 1] : undefined;
if (!cricsheetId) throw new Error("Usage: npm run backtest -- --match <cricsheet match id>");

const rules = RULES_PROFILES[DEFAULT_RULES_PROFILE];
const points = POINTS_PROFILES[DEFAULT_POINTS_PROFILE];

async function fetchAll<T>(db: ReturnType<typeof serverDb>, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(start, start + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) return out;
  }
}

async function main() {
  const db = serverDb();

  // ---- The match and its actual lineup ----
  const { data: match, error } = await db
    .from("matches")
    .select("id, start_time, venue_id, team_a, team_b, toss_winner, toss_decision, venues(name, city)")
    .eq("cricsheet_match_id", cricsheetId)
    .single();
  if (error) throw new Error(`match ${cricsheetId}: ${error.message}`);
  const date = String(match.start_time).slice(0, 10);
  const matchTeamIds: [number, number] = [match.team_a, match.team_b];

  // The rubric version in force (starts as RUBRIC v1.0; a new one is created when Aryan accepts a learning proposal).
  let active = await loadActiveRubric(db);
  if (!active) {
    const ins = await db.from("rubric_versions").insert({ config_json: RUBRIC, status: "active", reason: `initial ${RUBRIC.id}` }).select("id").single();
    if (ins.error) throw new Error(`rubric_versions: ${ins.error.message}`);
    active = { id: ins.data.id, cfg: RUBRIC };
  }
  const rubricCfg = active.cfg;
  console.log(`Rubric version #${active.id} (${rubricCfg.id}); role corrections: ${Object.entries(rubricCfg.calibration).map(([r, c]) => `${r} x${c.value}`).join(", ")}`);

  const teamNames = new Map((await fetchAll<{ id: number; name: string }>(db, "teams", "id,name")).map((t) => [t.id, t.name]));
  const people = await fetchAll<{ id: number; name: string }>(db, "players", "id,name");
  const names = new Map(people.map((p) => [p.id, p.name]));

  const { data: actualLines, error: lineErr } = await db.from("player_match_lines").select("player_id, team_id, stats_json").eq("match_id", match.id);
  if (lineErr) throw new Error(lineErr.message);
  const actualXI = (actualLines as unknown as { player_id: number; team_id: number; stats_json: StatsNoRole }[]).filter((l) => l.stats_json.inPlayingXI);

  // ---- History strictly before the match ----
  const rows = await loadHistoryRows(db, monthsBefore(date, WINDOW_MONTHS), date);
  console.log(`Match ${cricsheetId} on ${date}: ${teamNames.get(matchTeamIds[0])} v ${teamNames.get(matchTeamIds[1])}`);
  console.log(`History used: ${rows.length} rows from ${monthsBefore(date, WINDOW_MONTHS)} up to (not including) ${date}\n`);

  // Roles are inferred AS OF the match date from those same rows (not read from the players table, which holds
  // today's roles), so backtesting an older match cannot leak what a player did later.
  const roles = inferRolesFromRows(rows);
  // Roles typed by hand on the Data screen always win over inferred ones.
  const { data: overrides } = await db.from("manual_overrides").select("entity_id, value").eq("entity_type", "player").eq("field", "role");
  for (const o of overrides ?? []) if (["WK", "BAT", "AR", "BOWL"].includes(o.value)) roles.set(o.entity_id, o.value as Role);

  // ---- Predicted XI: each side's last N internationals ----
  const lastXIs = rubricCfg.availability.lastXIs.value;
  const predictedPool: PoolPlayer[] = [];
  for (const teamId of matchTeamIds) {
    const teamRows = rows.filter((r) => r.leagueTier === "international" && r.teamId === teamId && r.stats.inPlayingXI);
    const recentMatchIds = [...new Map(teamRows.map((r) => [r.matchId, r.date])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0])
      .slice(-lastXIs)
      .map(([id]) => id);
    const counts = new Map<number, number>();
    for (const r of teamRows) if (recentMatchIds.includes(r.matchId)) counts.set(r.playerId, (counts.get(r.playerId) ?? 0) + 1);
    for (const [playerId, n] of counts) {
      const pPlay = n / recentMatchIds.length;
      if (pPlay >= rubricCfg.availability.provisionalMin.value) predictedPool.push({ playerId, teamId, pPlay });
    }
  }
  const confirmedPool: PoolPlayer[] = actualXI.map((l) => ({ playerId: l.player_id, teamId: l.team_id, pPlay: 1 }));

  // ---- Seeded credits for everyone who could be picked ----
  const allIds = [...new Set([...predictedPool, ...confirmedPool].map((p) => p.playerId))];
  const priced = seedCreditsFor(rows, roles, allIds, allIds); // ranked against the players in this match
  const credits = new Map([...priced].filter(([, v]) => v.credit !== null).map(([id, v]) => [id, v.credit as number]));
  const { error: credErr } = await db
    .from("credits")
    .upsert([...credits].map(([player_id, c]) => ({ match_id: match.id, player_id, credits: c, source: "seeded" })), { onConflict: "match_id,player_id" });
  if (credErr) throw new Error(`credits: ${credErr.message}`);

  // ---- Predictions ----
  const common = { asOfDate: date, rows, roles, names, teamNames, matchTeamIds, venueId: match.venue_id as number | null, credits, rules, cfg: rubricCfg, points };
  const provisional = predict({ ...common, stage: "provisional", pool: predictedPool });
  const final = predict({ ...common, stage: "final", pool: confirmedPool });

  // ---- Actual points from the real scorecard ----
  const actual = new Map<number, number | null>();
  for (const l of actualXI) {
    const role = roles.get(l.player_id);
    actual.set(l.player_id, role ? scorePlayerMatch({ role, ...l.stats_json } as PlayerMatchStats, points).total : null);
  }
  const actualOf = (id: number) => actual.get(id) ?? 0; // not in the XI = did not play = 0 points
  const teamTotal = (p: Prediction) => {
    if (!p.selection || !p.captains) return null;
    const base = p.selected.reduce((a, s) => a + actualOf(s.candidate.id), 0);
    const cap = actualOf(p.captains.captainId!) * (rules.captainMultiplier.value - 1);
    const vc = actualOf(p.captains.viceCaptainId!) * (rules.viceCaptainMultiplier.value - 1);
    return base + cap + vc;
  };

  // Hindsight: the best team that could have been picked from the actual XI, knowing the real points.
  const hindsightPool: Candidate[] = [];
  for (const l of actualXI) {
    const role = roles.get(l.player_id);
    const credit = credits.get(l.player_id);
    const pts = actual.get(l.player_id);
    if (!role || credit === undefined || pts === null || pts === undefined) continue;
    hindsightPool.push({ id: l.player_id, name: names.get(l.player_id) ?? "?", team: teamNames.get(l.team_id) ?? "?", role, credits: credit, pPlay: 1, expectedIfPlays: pts, expected: pts, blankRate: 0, avgBallsFaced: null, avgOvers: null });
  }
  const hindsight = selectTeam(hindsightPool, rules);

  // ---- Print ----
  const show = (p: Prediction, label: string) => {
    console.log(`=== ${label} (${p.stage}) ===`);
    if (!p.selection) { console.log("No legal team.", p.notes.join(" ")); return; }
    console.log(`Credits ${p.selection.totalCredits}/100, rules profile: ${p.validation?.profile}, valid: ${p.validation?.valid}, search nodes: ${p.selection.nodesVisited}`);
    for (const s of p.selected) {
      const c = s.candidate;
      const tag = c.id === p.captains!.captainId ? " (C)" : c.id === p.captains!.viceCaptainId ? " (VC)" : "";
      const act = actual.has(c.id) ? String(actual.get(c.id)) : "DNP";
      console.log(`  ${(c.name + tag).padEnd(24)} ${c.role.padEnd(4)} ${c.team.padEnd(12)} ${String(c.credits).padStart(4)}cr  predicted ${c.expected.toFixed(1).padStart(5)}  actual ${act.padStart(4)}  pPlay ${c.pPlay.toFixed(2)}`);
    }
    console.log(`  ${p.deathLog.join(" ")}`);
    if (p.notes.length) console.log(`  Notes: ${p.notes.join(" | ")}`);
    console.log(`  Pitch: ${p.pitch.tag}${p.pitch.index === null ? "" : ` (index ${(p.pitch.index * 100).toFixed(1)}%, ${p.pitch.matches} matches${p.pitch.lowConfidence ? ", LOW confidence" : ""})`}; team form: ${Object.entries(p.teamForm).map(([t, f]) => `${t} x${f.multiplier.toFixed(3)}`).join(", ")}`);
    // Same formula for both sides (src/lib/teamScore.ts), so predicted and actual are comparable.
    const expectedMap = new Map(p.selected.map((s) => [s.candidate.id, s.candidate.expected]));
    const predictedTotal = teamScore(expectedMap, p.selected.map((s) => s.candidate.id), p.captains!.captainId, p.captains!.viceCaptainId, rules);
    console.log(`  Predicted team score (with C/VC): ${predictedTotal.toFixed(1)}   ACTUAL team score (with C/VC): ${teamTotal(p)?.toFixed(1)}\n`);
  };
  show(provisional, "PROVISIONAL, before the toss");
  show(final, "FINAL, confirmed XI");
  if (hindsight) {
    const best = hindsight.score;
    console.log(`Hindsight-best team from the actual XI (knowing the real points): ${best.toFixed(1)}`);
    for (const p of [provisional, final]) {
      const t = teamTotal(p);
      if (t !== null) console.log(`  ${p.stage} captured ${((t / best) * 100).toFixed(0)}% of the hindsight best`);
    }
  }
  const excl = [...provisional.excluded, ...final.excluded];
  if (excl.length) console.log(`Excluded (unavailable data): ${[...new Map(excl.map((e) => [e.playerId, e])).values()].map((e) => `${e.name} (${e.reason})`).join("; ")}`);

  // ---- Store ----
  // Re-running replaces only THIS rubric version's recommendations for the match, so earlier versions stay
  // available and accuracy can be compared before and after a learning change. Cascades to recommendation_players.
  await db.from("recommendations").delete().eq("match_id", match.id).eq("rubric_version_id", active.id);
  for (const p of [provisional, final]) {
    if (!p.selection || !p.captains) continue;
    const rec = await db
      .from("recommendations")
      .insert({
        match_id: match.id, rubric_version_id: active.id, stage: p.stage, captain_id: p.captains.captainId, vc_id: p.captains.viceCaptainId,
        // What the explanation layer needs, so "why the runner-up lost" comes from stored numbers:
        captain_scores_json: p.captains.scores,
        engine_notes_json: {
          deathLog: p.deathLog, notes: p.notes, unavailableFactors: p.unavailableFactors, validation: p.validation,
          rulesProfile: p.rulesProfile, rubricVersion: p.rubricVersion, totalCredits: p.selection.totalCredits, creditsSource: "seeded",
          excluded: p.excluded,
          // Against what: the average player of the match and a random legal team (see src/lib/fieldStats.ts).
          fieldStats: fieldStats({
            pickedIds: p.selected.map((s) => s.candidate.id), pool: p.pool.map((q) => q.candidate), actualOf,
            fieldPoints: [...actual.values()].filter((v): v is number => v !== null), rules,
          }),
        },
        captain_reason: null, vc_reason: null, summary_text: null, // written by explain.ts
      })
      .select("id")
      .single();
    if (rec.error) throw new Error(`recommendations: ${rec.error.message}`);
    const rowsOut = p.selected.map((s, idx) => ({
      recommendation_id: rec.data.id, player_id: s.candidate.id, slot: "starter", rank: idx + 1, expected_points: s.candidate.expected,
      factors_json: { ...s.factors, credits: s.candidate.credits, creditsSource: "seeded", rulesProfile: p.rulesProfile, rubric: p.rubricVersion },
      reason_text: null, // written by Gemini in M4, from these numbers
    }));
    const ins = await db.from("recommendation_players").insert(rowsOut);
    if (ins.error) throw new Error(`recommendation_players: ${ins.error.message}`);
  }

  const actualRows = [...new Set([...provisional.selected, ...final.selected].map((s) => s.candidate.id))].map((id) => ({
    match_id: match.id, player_id: id, points: actualOf(id), entered_by: "scorecard", source: "computed_from_scorecard",
  }));
  const act = await db.from("actual_points").upsert(actualRows, { onConflict: "match_id,player_id,source" });
  if (act.error) throw new Error(`actual_points: ${act.error.message}`);

  await db.from("predicted_xi").delete().eq("match_id", match.id);
  const xiRows = [
    ...predictedPool.map((p) => ({ match_id: match.id, team_id: p.teamId, player_id: p.playerId, source: "predicted", confidence: p.pPlay })),
  ];
  const confirmedIds = new Set(confirmedPool.map((p) => p.playerId));
  const xiFinal = [
    ...xiRows.filter((r) => !confirmedIds.has(r.player_id)),
    ...confirmedPool.map((p) => ({ match_id: match.id, team_id: p.teamId, player_id: p.playerId, source: "confirmed", confidence: 1 })),
  ];
  const xi = await db.from("predicted_xi").insert(xiFinal);
  if (xi.error) throw new Error(`predicted_xi: ${xi.error.message}`);

  await db.from("match_context").upsert({ match_id: match.id, pitch_tags_json: { ...final.pitch, teamForm: final.teamForm, unavailableFactors: final.unavailableFactors } }, { onConflict: "match_id" });
  console.log("\nStored: recommendations, recommendation_players, actual_points (computed_from_scorecard), predicted_xi, pitch tags.");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
