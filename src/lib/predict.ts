import { DEFAULT_POINTS_PROFILE, POINTS_PROFILES, type PointsProfile } from "@/config/points";
import { RUBRIC, type RubricConfig } from "@/config/rubric";
import { DEFAULT_RULES_PROFILE, RULES_PROFILES, type Role, type RulesProfile } from "@/config/rules";
import { deathBaseline, deathProfile, type DeathProfile } from "./deathBowler";
import { monthsBefore } from "./dates";
import { baseForm, rolePriors, shrinkToPrior } from "./expectedPoints";
import { fantasyPointsSeries, type HistoryRow } from "./history";
import {
  matchResults, pitchTag, teamFormFactor, teamInnings, teamResultsFor, venueIndices, venueMultiplier,
  type Pitch, type TeamForm,
} from "./matchContext";
import { applyDeathRule, chooseCaptains, selectTeam, type Candidate, type CaptainChoice, type Selection } from "./selectTeam";
import { validateTeam, type ValidationResult } from "./validateTeam";

// The prediction pipeline for ONE match: history in, recommended 11 with captain and vice-captain out.
// Pure and deterministic. It ignores any history row dated on or after asOfDate, so it cannot peek.

export interface PoolPlayer {
  playerId: number;
  teamId: number;
  pPlay: number; // 1 when the XI is confirmed
}

export interface PredictInput {
  stage: "provisional" | "final";
  asOfDate: string; // YYYY-MM-DD, the match date
  rows: HistoryRow[];
  roles: Map<number, Role>;
  names: Map<number, string>;
  teamNames: Map<number, string>;
  matchTeamIds: [number, number];
  venueId: number | null;
  pool: PoolPlayer[];
  credits: Map<number, number>;
  rules?: RulesProfile;
  cfg?: RubricConfig;
  points?: PointsProfile;
}

// Everything that explains one player's number. Stored as factors_json so the dashboard can show why.
export interface Factors {
  role: Role;
  basePoints: number;
  shrunkBase: number;
  rolePrior: number;
  matchesUsed: number;
  evidence: number;
  recentMean: number | null;
  longMean: number | null;
  venueMultiplier: number;
  teamFormMultiplier: number;
  calibration?: number; // learned per-role correction (1 = none); absent on predictions made before it existed
  pPlay: number;
  deathBonus: number;
  death: Pick<DeathProfile, "eligible" | "profile" | "score" | "deathBalls" | "deathEconomy" | "lowConfidence"> | null;
  blankRate: number;
  avgBallsFaced: number | null;
  avgOvers: number | null;
  lastPoints: number[];
}

export interface PredictedPlayer {
  candidate: Candidate;
  factors: Factors;
}

export interface Prediction {
  stage: "provisional" | "final";
  asOfDate: string;
  rulesProfile: string;
  rubricVersion: string;
  pool: PredictedPlayer[];
  excluded: { playerId: number; name: string; reason: string }[];
  selected: PredictedPlayer[];
  selection: Selection | null;
  captains: CaptainChoice | null;
  validation: ValidationResult | null;
  pitch: Pitch;
  teamForm: Record<string, TeamForm>;
  deathLog: string[];
  notes: string[];
  unavailableFactors: string[];
}

// Honest list of what the model does NOT use, shown on the dashboard. Missing data is never invented.
export const UNAVAILABLE_FACTORS = [
  "Batter vs bowler-type matchups (no batting-hand or bowling-type data)",
  "Spin vs pace pitch effect (no bowling-type data)",
  "Opener vs opening-bowler penalty (no batting-order data)",
  "Toss and dew effect (applied only after the toss; not used in v1)",
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function predict(input: PredictInput): Prediction {
  const cfg = input.cfg ?? RUBRIC;
  const rules = input.rules ?? RULES_PROFILES[DEFAULT_RULES_PROFILE];
  const points = input.points ?? POINTS_PROFILES[DEFAULT_POINTS_PROFILE];
  const notes: string[] = [];

  // No peeking: only matches strictly before the match date.
  const rows = input.rows.filter((r) => r.date < input.asOfDate);
  const byPlayer = new Map<number, HistoryRow[]>();
  for (const r of rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);

  // 1. Base form for everyone with a role; role averages from established players only.
  const forms = new Map<number, { series: ReturnType<typeof fantasyPointsSeries>; form: ReturnType<typeof baseForm> }>();
  for (const [id, rs] of byPlayer) {
    const role = input.roles.get(id);
    if (!role) continue;
    const series = fantasyPointsSeries(rs, role, points);
    const form = baseForm(series, cfg);
    if (form.base !== null) forms.set(id, { series, form });
  }
  const priors = rolePriors(
    [...forms].map(([id, f]) => ({ role: input.roles.get(id)!, base: f.form.base!, effectiveN: f.form.effectiveN })),
  );

  // 2. The ground and each team's recent run.
  const innings = teamInnings(rows);
  const pitch = pitchTag(input.venueId === null ? undefined : venueIndices(innings).get(input.venueId), cfg);
  const results = matchResults(teamInnings(rows.filter((r) => r.leagueTier === "international")));
  const teamForm: Record<string, TeamForm> = {};
  for (const tid of input.matchTeamIds) teamForm[input.teamNames.get(tid) ?? String(tid)] = teamFormFactor(teamResultsFor(results, tid), cfg);

  // 3. Death specialists, found from data.
  const windowStart = monthsBefore(input.asOfDate, cfg.death.windowMonths.value);
  const windowRows = rows.filter((r) => r.date >= windowStart);
  const baseline = deathBaseline(windowRows);
  const windowByPlayer = new Map<number, HistoryRow[]>();
  for (const r of windowRows) windowByPlayer.set(r.playerId, [...(windowByPlayer.get(r.playerId) ?? []), r]);

  // 4. Build the candidates.
  const excluded: Prediction["excluded"] = [];
  const pool: PredictedPlayer[] = [];
  for (const p of input.pool) {
    const name = input.names.get(p.playerId) ?? String(p.playerId);
    const role = input.roles.get(p.playerId);
    const f = forms.get(p.playerId);
    const credits = input.credits.get(p.playerId);
    if (!role) { excluded.push({ playerId: p.playerId, name, reason: "role unavailable (too little recent history)" }); continue; }
    if (!f) { excluded.push({ playerId: p.playerId, name, reason: "no match history" }); continue; }
    if (credits === undefined) { excluded.push({ playerId: p.playerId, name, reason: "credits unavailable" }); continue; }

    const teamName = input.teamNames.get(p.teamId) ?? String(p.teamId);
    const shrunk = shrinkToPrior(f.form.base!, f.form.effectiveN, priors[role], cfg.form.shrinkK.value);
    const venueM = venueMultiplier(role, pitch, cfg);
    const formM = teamForm[teamName]?.multiplier ?? 1;
    const calibration = cfg.calibration?.[role]?.value ?? 1;
    const expectedIfPlays = shrunk * venueM * formM * calibration;

    const recent = (byPlayer.get(p.playerId) ?? [])
      .filter((r) => r.stats.inPlayingXI)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-cfg.form.recentMatches.value);
    const batted = recent.flatMap((r) => (r.stats.batting ?? []).filter((i) => !i.superOver)).map((i) => i.balls);
    const bowled = recent.flatMap((r) => (r.stats.bowling ?? []).filter((s) => !s.superOver && s.balls > 0)).map((s) => s.balls / 6);
    const lastPoints = f.series.slice(-cfg.form.recentMatches.value).map((e) => e.points);
    const last15 = f.series.slice(-15);
    const blankRate = last15.filter((e) => e.points < cfg.captain.lowPoints.value).length / last15.length;

    const death =
      baseline && (role === "BOWL" || role === "AR")
        ? deathProfile(windowByPlayer.get(p.playerId) ?? [], baseline, cfg)
        : null;

    pool.push({
      candidate: {
        id: p.playerId, name, team: teamName, role, credits, pPlay: p.pPlay, expectedIfPlays,
        expected: p.pPlay * expectedIfPlays, blankRate,
        avgBallsFaced: batted.length ? mean(batted) : null, avgOvers: bowled.length ? mean(bowled) : null,
      },
      factors: {
        role, basePoints: f.form.base!, shrunkBase: shrunk, rolePrior: priors[role], matchesUsed: f.form.matches,
        evidence: f.form.effectiveN, recentMean: f.form.recentMean, longMean: f.form.longMean,
        venueMultiplier: venueM, teamFormMultiplier: formM, calibration, pPlay: p.pPlay, deathBonus: 0,
        death: death && { eligible: death.eligible, profile: death.profile, score: death.score, deathBalls: death.deathBalls, deathEconomy: death.deathEconomy, lowConfidence: death.lowConfidence },
        blankRate, avgBallsFaced: batted.length ? mean(batted) : null, avgOvers: bowled.length ? mean(bowled) : null, lastPoints,
      },
    });
  }

  // 5. Death-bowler slot rule.
  const specialists = pool
    .filter((p) => p.factors.death?.eligible && p.factors.death.score !== null)
    .map((p) => ({ id: p.candidate.id, score: p.factors.death!.score! }));
  const death = applyDeathRule(pool.map((p) => p.candidate), specialists, cfg);
  if (death.bonusId !== null) {
    const hit = pool.find((p) => p.candidate.id === death.bonusId)!;
    const bonus = cfg.death.bonus.value;
    hit.candidate.expectedIfPlays *= 1 + bonus;
    hit.candidate.expected *= 1 + bonus;
    hit.factors.deathBonus = bonus;
  }

  // 6. Select, then choose the captain and vice-captain.
  const candidates = pool.map((p) => p.candidate);
  let selection = selectTeam(candidates, rules, { forcedIds: death.forcedIds });
  if (!selection && death.forcedIds.length > 0) {
    selection = selectTeam(candidates, rules);
    if (selection) notes.push("The guaranteed death-specialist slot made a legal team impossible; selected without it.");
  }
  if (!selection) {
    const perTeam = new Map<string, number>();
    for (const c of candidates) perTeam.set(c.team, (perTeam.get(c.team) ?? 0) + 1);
    const perRole = (["WK", "BAT", "AR", "BOWL"] as Role[]).map((r) => `${r} ${candidates.filter((c) => c.role === r).length}`);
    notes.push(
      `No legal team can be built from this pool under the active rules. Usable players: ${candidates.length} ` +
        `(${[...perTeam].map(([t, n]) => `${t} ${n}`).join(", ") || "none"}; ${perRole.join(", ")}). ` +
        `${excluded.length} player(s) were left out for missing data: add their roles or credits on the manual data screen and re-run.`,
    );
    return {
      stage: input.stage, asOfDate: input.asOfDate, rulesProfile: rules.id, rubricVersion: cfg.id, pool, excluded, selected: [],
      selection: null, captains: null, validation: null, pitch, teamForm, deathLog: death.log, notes, unavailableFactors: UNAVAILABLE_FACTORS,
    };
  }

  const captains = chooseCaptains(selection.players, cfg);
  notes.push(...captains.notes);
  const validation = validateTeam(
    {
      players: selection.players.map((c) => ({ id: String(c.id), name: c.name, team: c.team, role: c.role, credits: c.credits })),
      captainId: captains.captainId === null ? undefined : String(captains.captainId),
      viceCaptainId: captains.viceCaptainId === null ? undefined : String(captains.viceCaptainId),
    },
    rules,
  );
  if (input.stage === "provisional") notes.push("PROVISIONAL: based on predicted XIs. It is replaced when the confirmed XI is announced.");

  const ids = new Set(selection.players.map((c) => c.id));
  return {
    stage: input.stage, asOfDate: input.asOfDate, rulesProfile: rules.id, rubricVersion: cfg.id, pool, excluded,
    selected: pool.filter((p) => ids.has(p.candidate.id)).sort((a, b) => b.candidate.expected - a.candidate.expected),
    selection, captains, validation, pitch, teamForm, deathLog: death.log, notes, unavailableFactors: UNAVAILABLE_FACTORS,
  };
}
