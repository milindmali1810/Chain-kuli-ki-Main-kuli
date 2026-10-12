// Honest evaluation of the prediction model on MANY past matches, using only data from before each match.
// Runs outside Vercel:  npm run evaluate -- [--matches 90] [--variants all|base]
//
// For every match it predicts the FINAL team (the real XI is the pool), then compares with the real points:
//   edge     = average real points of the 11 picked players minus the average of every player in the two XIs
//   spearman = how well the predicted points rank ALL players of the match (not only the picked ones)
//   mae/bias = size and direction of the per-player error
// Older matches (first 60%) choose a setting, newer ones (last 40%) only test it, so a setting is not judged on the
// matches it was fitted to.

import { POINTS_PROFILES, DEFAULT_POINTS_PROFILE } from "../src/config/points";
import { RUBRIC, type RubricConfig } from "../src/config/rubric";
import { DEFAULT_RULES_PROFILE, RULES_PROFILES } from "../src/config/rules";
import { loadActiveRubric, loadHistoryRows, monthsBefore, serverDb } from "../src/lib/db";
import { inferRolesFromRows, type StatsNoRole } from "../src/lib/inferRole";
import { predict, type PoolPlayer } from "../src/lib/predict";
import { scorePlayerMatch, type PlayerMatchStats } from "../src/lib/scorePlayerMatch";
import { seedCreditsFor } from "../src/lib/seedCredits";
import { summariseEdge, spearman } from "../src/lib/edge";
import { selectTeam } from "../src/lib/selectTeam";

const args = process.argv.slice(2);
const argVal = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(argVal("--matches", "90"));
const VARIANTS = argVal("--variants", "all");

const rules = RULES_PROFILES[DEFAULT_RULES_PROFILE];
const points = POINTS_PROFILES[DEFAULT_POINTS_PROFILE];
const WINDOW = 36;

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function variant(base: RubricConfig, edit: (c: RubricConfig) => void): RubricConfig { const c = clone(base); edit(c); return c; }

interface Case { id: string; date: string; teamIds: [number, number]; venueId: number | null; xi: { playerId: number; teamId: number; stats: StatsNoRole }[] }

async function main() {
  const db = serverDb();
  const { data: league } = await db.from("leagues").select("id").eq("tier", "international").eq("gender", "male").limit(1).maybeSingle();
  const { data: ms, error } = await db
    .from("matches")
    .select("id, cricsheet_match_id, start_time, venue_id, team_a, team_b")
    .eq("league_id", league!.id)
    .not("cricsheet_match_id", "like", "live-%")
    .lt("start_time", "2026-10-12T00:00:00Z")
    .order("start_time", { ascending: false })
    .limit(N + 10);
  if (error) throw new Error(error.message);

  const cases: Case[] = [];
  for (const m of ms ?? []) {
    const { data: lines } = await db.from("player_match_lines").select("player_id, team_id, stats_json").eq("match_id", m.id);
    const xi = (lines ?? []).filter((l) => (l.stats_json as StatsNoRole).inPlayingXI).map((l) => ({ playerId: l.player_id as number, teamId: l.team_id as number, stats: l.stats_json as StatsNoRole }));
    const per = new Map<number, number>();
    for (const p of xi) per.set(p.teamId, (per.get(p.teamId) ?? 0) + 1);
    if (xi.length < 20 || per.size !== 2) continue; // need both full XIs
    cases.push({ id: m.cricsheet_match_id, date: String(m.start_time).slice(0, 10), teamIds: [m.team_a, m.team_b], venueId: m.venue_id, xi });
    if (cases.length === N) break;
  }
  cases.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`Evaluating ${cases.length} men's T20I matches from ${cases[0].date} to ${cases[cases.length - 1].date}`);

  const names = new Map<number, string>();
  const teamNames = new Map<number, string>();
  const { data: tm } = await db.from("teams").select("id, name");
  for (const t of tm ?? []) teamNames.set(t.id, t.name);

  console.log("Loading history once ...");
  const rows = await loadHistoryRows(db, monthsBefore(cases[0].date, WINDOW), "2026-10-12");
  console.log(`History rows: ${rows.length}`);

  // Per-match inputs that do not depend on the setting being tested.
  const prepared = cases.map((c) => {
    const window = rows.filter((r) => r.date < c.date && r.date >= monthsBefore(c.date, WINDOW));
    const roles = inferRolesFromRows(window);
    const ids = c.xi.map((p) => p.playerId);
    const priced = seedCreditsFor(window, roles, ids, ids);
    const credits = new Map([...priced].filter(([, v]) => v.credit !== null).map(([id, v]) => [id, v.credit as number]));
    const pool: PoolPlayer[] = c.xi.map((p) => ({ playerId: p.playerId, teamId: p.teamId, pPlay: 1 }));
    const actual = new Map<number, number>();
    for (const p of c.xi) {
      const role = roles.get(p.playerId);
      if (role) actual.set(p.playerId, scorePlayerMatch({ role, ...p.stats } as PlayerMatchStats, points).total);
    }
    return { c, window, roles, credits, pool, actual };
  });

  const active = await loadActiveRubric(db);
  const v1 = RUBRIC;
  const variants: { name: string; cfg: RubricConfig }[] = [
    { name: "v1 (no corrections)", cfg: v1 },
    ...(active ? [{ name: `active v${active.id} (role corrections)`, cfg: active.cfg }] : []),
  ];
  if (VARIANTS === "all") {
    for (const k of [20, 40, 80, 160]) variants.push({ name: `v1 + shrinkK ${k}`, cfg: variant(v1, (c) => { c.form.shrinkK.value = k; }) });
    for (const w of [0.2, 0.6, 0.8]) variants.push({ name: `v1 + recentWeight ${w}`, cfg: variant(v1, (c) => { c.form.recentWeight.value = w; }) });
    for (const n of [4, 12]) variants.push({ name: `v1 + recentMatches ${n}`, cfg: variant(v1, (c) => { c.form.recentMatches.value = n; }) });
    for (const n of [15, 50]) variants.push({ name: `v1 + longMatches ${n}`, cfg: variant(v1, (c) => { c.form.longMatches.value = n; }) });
    variants.push({ name: "v1 + venue off", cfg: variant(v1, (c) => { c.venue.adj.value = 0; }) });
    variants.push({ name: "v1 + team form off", cfg: variant(v1, (c) => { c.teamForm.cap.value = 0; }) });
  }

  const split = Math.floor(prepared.length * 0.6);
  const fmt = (s: ReturnType<typeof summariseEdge>) => `edge ${s.edge >= 0 ? "+" : ""}${s.edge.toFixed(1)} (±${s.se.toFixed(1)}), beat field ${s.wins}/${s.matches}, rank ${s.spearman.toFixed(2)}, MAE ${s.mae.toFixed(1)}, bias ${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(1)}`;
  const results: { name: string; train: ReturnType<typeof summariseEdge>; test: ReturnType<typeof summariseEdge>; all: ReturnType<typeof summariseEdge> }[] = [];

  for (const v of variants) {
    const per: Parameters<typeof summariseEdge>[0] = [];
    for (const p of prepared) {
      const pred = predict({
        stage: "final", asOfDate: p.c.date, rows: p.window, roles: p.roles, names, teamNames, matchTeamIds: p.c.teamIds, venueId: p.c.venueId,
        pool: p.pool, credits: p.credits, rules, cfg: v.cfg, points,
      });
      if (!pred.selection || !pred.captains) continue;
      const pickedIds = new Set(pred.selected.map((s) => s.candidate.id));
      const picked = [...pickedIds].map((id) => p.actual.get(id)).filter((x): x is number => x !== undefined);
      const field = [...p.actual.values()];
      const pairs = pred.pool.filter((q) => p.actual.has(q.candidate.id)).map((q) => ({ predicted: q.candidate.expected, actual: p.actual.get(q.candidate.id)! }));
      per.push({ date: p.c.date, picked, field, pairs });
    }
    const train = summariseEdge(per.slice(0, split));
    const test = summariseEdge(per.slice(split));
    const all = summariseEdge(per);
    results.push({ name: v.name, train, test, all });
    console.log(`\n${v.name}\n  ALL   (${all.matches}): ${fmt(all)}\n  train (${train.matches}): ${fmt(train)}\n  test  (${test.matches}): ${fmt(test)}`);
  }

  // ---- Baselines on the SAME matches: what do simple strategies score under the same credit cap and role rules? ----
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const RANDOM = "random legal team (20 per match)";
  const STARS = "most expensive stars (max credits)";
  const FORM = "plain recent form (no shrink, venue, team form)";
  const base: Record<string, Parameters<typeof summariseEdge>[0]> = { [RANDOM]: [], [STARS]: [], [FORM]: [] };
  for (const p of prepared) {
    const pred = predict({ stage: "final", asOfDate: p.c.date, rows: p.window, roles: p.roles, names, teamNames, matchTeamIds: p.c.teamIds, venueId: p.c.venueId, pool: p.pool, credits: p.credits, rules, cfg: v1, points });
    if (!pred.selection) continue;
    const cands = pred.pool.map((q) => ({ cand: q.candidate, base: q.factors.basePoints }));
    const field = [...p.actual.values()];
    const score = (team: { players: { id: number }[] } | null) => (team ? team.players.map((c) => p.actual.get(c.id)).filter((x): x is number => x !== undefined) : []);
    const randAvgs: number[] = [];
    for (let k = 0; k < 20; k++) {
      const r = score(selectTeam(cands.map((c) => { const x = rand(); return { ...c.cand, expected: x, expectedIfPlays: x }; }), rules));
      if (r.length) randAvgs.push(r.reduce((a, b) => a + b, 0) / r.length);
    }
    if (randAvgs.length) base[RANDOM].push({ picked: [randAvgs.reduce((a, b) => a + b, 0) / randAvgs.length], field, pairs: [] });
    base[STARS].push({ picked: score(selectTeam(cands.map((c) => ({ ...c.cand, expected: c.cand.credits, expectedIfPlays: c.cand.credits })), rules)), field, pairs: [] });
    base[FORM].push({ picked: score(selectTeam(cands.map((c) => ({ ...c.cand, expected: c.base, expectedIfPlays: c.base })), rules)), field, pairs: [] });
  }
  console.log("\n=== Baselines (same matches, same cap and role rules) ===");
  for (const [name, per] of Object.entries(base)) {
    const a = summariseEdge(per.slice(0, split)), b = summariseEdge(per.slice(split)), all = summariseEdge(per);
    console.log(`${name.padEnd(50)} all ${all.edge >= 0 ? "+" : ""}${all.edge.toFixed(1)} (±${all.se.toFixed(1)}), beat field ${all.wins}/${all.matches};  train ${a.edge.toFixed(1)}  test ${b.edge.toFixed(1)}`);
  }

  console.log("\n=== Summary, sorted by TEST edge (higher is better) ===");
  for (const r of [...results].sort((a, b) => b.test.edge - a.test.edge)) console.log(`${r.name.padEnd(36)} test ${r.test.edge >= 0 ? "+" : ""}${r.test.edge.toFixed(1)} (±${r.test.se.toFixed(1)})  train ${r.train.edge >= 0 ? "+" : ""}${r.train.edge.toFixed(1)}  rank(test) ${r.test.spearman.toFixed(2)}`);
  void spearman;
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
