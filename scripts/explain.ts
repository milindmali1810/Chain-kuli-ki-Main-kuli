// Writes the "why" for a stored recommendation. Gemini Flash writes sentences from numbers the engine already
// produced; plain code rejects any sentence with a number that is not in those facts (see src/lib/reasoning.ts).
// Runs outside Vercel:  npm run explain -- --match 1529230 [--no-gemini]
//   --no-gemini   skip the API call and use the plain templates (also what happens if Gemini fails)

import { serverDb } from "../src/lib/db";
import { generateJson } from "../src/lib/gemini";
import {
  OUTPUT_SCHEMA, SYSTEM_PROMPT, assembleExplanation, buildPrompt,
  type Facts, type PickFacts,
} from "../src/lib/reasoning";

const args = process.argv.slice(2);
const i = args.indexOf("--match");
const cricsheetId = i >= 0 ? args[i + 1] : undefined;
if (!cricsheetId) throw new Error("Usage: npm run explain -- --match <cricsheet match id> [--no-gemini]");
const useGemini = !args.includes("--no-gemini");

const r1 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const effectPct = (multiplier: number) => Math.round((multiplier - 1) * 1000) / 10; // 1.025 -> 2.5

interface StoredFactors {
  role: string; basePoints: number; rolePrior: number; matchesUsed: number; recentMean: number | null; longMean: number | null;
  venueMultiplier: number; teamFormMultiplier: number; pPlay: number; deathBonus: number; blankRate: number;
  avgBallsFaced: number | null; avgOvers: number | null; lastPoints: number[]; credits: number;
  death: { profile: string | null; deathEconomy: number | null; deathBalls: number } | null;
}

async function main() {
  const db = serverDb();
  const { data: match, error } = await db
    .from("matches")
    .select("id, start_time, venues(name, city), team_a, team_b")
    .eq("cricsheet_match_id", cricsheetId)
    .single();
  if (error) throw new Error(`match ${cricsheetId}: ${error.message}`);

  const { data: teams } = await db.from("teams").select("id, name").in("id", [match.team_a, match.team_b]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const { data: ctx } = await db.from("match_context").select("weather_json, pitch_tags_json").eq("match_id", match.id).maybeSingle();
  const { data: recs, error: recErr } = await db.from("recommendations").select("*").eq("match_id", match.id).order("id");
  if (recErr) throw new Error(recErr.message);
  if (!recs?.length) throw new Error("No recommendations stored for this match. Run: npm run backtest -- --match " + cricsheetId);

  const apiKey = process.env.GEMINI_API_KEY;
  const date = new Date(String(match.start_time));
  const venue = match.venues as unknown as { name: string; city: string | null } | null;
  const pitch = (ctx?.pitch_tags_json ?? {}) as { tag?: string; index?: number | null; matches?: number; lowConfidence?: boolean; teamForm?: Record<string, { multiplier: number }> };
  const weather = (ctx?.weather_json as { summary?: Facts["context"]["weather"] } | null)?.summary ?? null;

  let geminiCalls = 0;
  let geminiFailures = 0;
  let accepted = 0;
  let replaced = 0;
  const allRejections: string[] = [];

  for (const rec of recs) {
    const { data: rows, error: rpErr } = await db
      .from("recommendation_players")
      .select("player_id, rank, expected_points, factors_json, players(name)")
      .eq("recommendation_id", rec.id)
      .order("rank");
    if (rpErr) throw new Error(rpErr.message);

    const picks: PickFacts[] = (rows as unknown as { player_id: number; rank: number; expected_points: number; factors_json: StoredFactors; players: { name: string } }[]).map((r) => {
      const f = r.factors_json;
      // Only send stats that mean something for the role: no "average overs" for a keeper, no "balls faced" for a bowler.
      const batsStat = f.role === "BAT" || f.role === "WK" || f.role === "AR";
      const bowlsStat = f.role === "BOWL" || f.role === "AR";
      return {
        playerId: r.player_id, name: r.players.name, role: f.role, team: "", opponent: "", credits: f.credits, expectedPoints: r1(r.expected_points)!,
        rank: r.rank, isCaptain: r.player_id === rec.captain_id, isViceCaptain: r.player_id === rec.vc_id,
        basePoints: r1(f.basePoints)!, recentMean: r1(f.recentMean), longMean: r1(f.longMean), rolePrior: r1(f.rolePrior)!,
        matchesUsed: f.matchesUsed, lastPoints: f.lastPoints.map((x) => Math.round(x)), venueEffectPct: effectPct(f.venueMultiplier),
        teamFormEffectPct: effectPct(f.teamFormMultiplier), chanceOfPlayingPct: Math.round(f.pPlay * 100),
        blankMatchesPct: Math.round(f.blankRate * 100),
        ...(batsStat ? { avgBallsFaced: r1(f.avgBallsFaced) } : {}),
        ...(bowlsStat ? { avgOvers: r1(f.avgOvers) } : {}),
        deathBonusPct: Math.round(f.deathBonus * 100),
        death: f.death ? { profile: f.death.profile, deathEconomy: r1(f.death.deathEconomy), deathBallsLast24Months: f.death.deathBalls } : null,
      };
    });

    // Team names for each player (from the stored lines for this match).
    const { data: lines } = await db.from("player_match_lines").select("player_id, team_id").eq("match_id", match.id).in("player_id", picks.map((p) => p.playerId));
    const teamOf = new Map((lines ?? []).map((l) => [l.player_id, teamName.get(l.team_id) ?? "?"]));
    const { data: pre } = await db.from("predicted_xi").select("player_id, team_id").eq("match_id", match.id).in("player_id", picks.map((p) => p.playerId));
    for (const p of picks) p.team = teamOf.get(p.playerId) ?? teamName.get((pre ?? []).find((x) => x.player_id === p.playerId)?.team_id) ?? "?";
    const sides = [teamName.get(match.team_a) ?? "?", teamName.get(match.team_b) ?? "?"];
    for (const p of picks) p.opponent = sides.find((s) => s !== p.team) ?? "?";
    const countBy = (key: (p: PickFacts) => string) => picks.reduce<Record<string, number>>((m, p) => ({ ...m, [key(p)]: (m[key(p)] ?? 0) + 1 }), {});

    const scores = (rec.captain_scores_json ?? []) as { name: string; captainScore: number | null }[];
    const notes = (rec.engine_notes_json ?? {}) as { deathLog?: string[]; unavailableFactors?: string[]; totalCredits?: number };
    const facts: Facts = {
      context: {
        stage: rec.stage, matchLabel: `${teamName.get(match.team_a)} v ${teamName.get(match.team_b)}`,
        date: { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() },
        venue: venue ? [venue.name, venue.city].filter(Boolean).join(", ") : "unknown venue",
        pitch: { tag: pitch.tag ?? "NEUTRAL", indexPct: pitch.index === null || pitch.index === undefined ? null : r1(pitch.index * 100), matches: pitch.matches ?? 0, lowConfidence: pitch.lowConfidence ?? true },
        weather: weather ? { tempC: weather.tempC, humidityPct: weather.humidityPct, dewPointC: weather.dewPointC, rainMm: weather.rainMm, cloudPct: weather.cloudPct, windKmh: weather.windKmh } : null,
        teamFormEffectPct: Object.fromEntries(Object.entries(pitch.teamForm ?? {}).map(([t, f]) => [t, effectPct(f.multiplier)])),
        totalCredits: notes.totalCredits ?? picks.reduce((a, p) => a + p.credits, 0), creditCap: 100, creditsAreSeeded: true,
        composition: { byRole: countBy((p) => p.role), byTeam: countBy((p) => p.team) },
        deathLog: notes.deathLog ?? [], unavailableFactors: notes.unavailableFactors ?? [],
        captainRace: scores.filter((s) => s.captainScore !== null).map((s) => ({ name: s.name, captainScore: r1(s.captainScore) })).sort((a, b) => (b.captainScore ?? 0) - (a.captainScore ?? 0)),
      },
      picks,
    };

    let raw: unknown = null;
    if (useGemini && apiKey) {
      geminiCalls += 1;
      try {
        raw = await generateJson({ apiKey, system: SYSTEM_PROMPT, input: buildPrompt(facts), schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> });
      } catch (e) {
        geminiFailures += 1;
        console.log(`Gemini failed for the ${rec.stage} stage, using plain templates: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      console.log(`${useGemini ? "No GEMINI_API_KEY" : "--no-gemini"}: using plain templates for the ${rec.stage} stage.`);
    }

    const ex = assembleExplanation(facts, raw);
    accepted += ex.report.acceptedFromGemini;
    replaced += ex.report.replacedByTemplate;
    allRejections.push(...ex.report.rejections.map((x) => `[${rec.stage}] ${x}`));

    for (const p of picks) {
      const e = ex.picks.get(p.playerId)!;
      const row = (rows as unknown as { player_id: number; factors_json: Record<string, unknown> }[]).find((x) => x.player_id === p.playerId)!;
      const { error: upErr } = await db
        .from("recommendation_players")
        .update({ reason_text: e.text, factors_json: { ...row.factors_json, reasonSource: e.source } })
        .eq("recommendation_id", rec.id)
        .eq("player_id", p.playerId);
      if (upErr) throw new Error(`reason_text: ${upErr.message}`);
    }
    const { error: recUp } = await db
      .from("recommendations")
      .update({
        captain_reason: `${ex.captain.reason} ${ex.captain.whyNotRunnerUp}`.trim(),
        vc_reason: ex.viceCaptain.reason,
        summary_text: ex.summary.text,
      })
      .eq("id", rec.id);
    if (recUp) throw new Error(`recommendation text: ${recUp.message}`);
    if (rec.stage === "final") {
      await db.from("match_context").upsert({ match_id: match.id, pitch_report_text: ex.pitchReport.text }, { onConflict: "match_id" });
    }

    console.log(`\n=== ${rec.stage.toUpperCase()} ===`);
    console.log(`Summary: ${ex.summary.text} [${ex.summary.source}]`);
    for (const p of picks) {
      const e = ex.picks.get(p.playerId)!;
      console.log(`- ${p.name}${p.isCaptain ? " (C)" : p.isViceCaptain ? " (VC)" : ""} [${e.source}]: ${e.text}`);
    }
    console.log(`Captain [${ex.captain.source}]: ${ex.captain.reason} ${ex.captain.whyNotRunnerUp}`);
    console.log(`Vice-captain [${ex.viceCaptain.source}]: ${ex.viceCaptain.reason}`);
    console.log(`Pitch [${ex.pitchReport.source}]: ${ex.pitchReport.text}`);
  }

  // An audit trail of AI use: what was asked, what was accepted, what was thrown away.
  await db.from("ingestion_runs").insert({
    source: "gemini-explain", status: geminiFailures > 0 && accepted === 0 ? "failed" : "ok", finished_at: new Date().toISOString(),
    rows_written: accepted + replaced,
    notes: `match ${cricsheetId}; model gemini-3.8-flash; calls ${geminiCalls}, failures ${geminiFailures}; sentences accepted ${accepted}, replaced by template ${replaced}${allRejections.length ? "; rejected: " + allRejections.join(" | ").slice(0, 600) : ""}`,
  });
  console.log(`\nGemini calls: ${geminiCalls} (failures ${geminiFailures}). Sentences accepted: ${accepted}. Replaced by template: ${replaced}.`);
  if (allRejections.length) console.log("Rejected by the guard:\n  " + allRejections.join("\n  "));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
