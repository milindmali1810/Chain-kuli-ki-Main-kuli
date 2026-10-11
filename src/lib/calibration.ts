import type { Role } from "@/config/rules";

// The learning loop's maths. Pure functions: rows in, numbers and proposals out.
// It PROPOSES changes; a person (Aryan) accepts or rejects them. Nothing here changes a prediction by itself.

export interface CompareRow {
  matchId: number;
  role: Role;
  predicted: number; // what the engine expected this player to score
  actual: number; // what he really scored
  pitch: string; // HIGH_SCORING | LOW_SCORING | NEUTRAL
}

export interface GroupStat {
  n: number;
  meanPredicted: number;
  meanActual: number;
  bias: number; // mean predicted minus mean actual: above 0 means the engine over-predicts
  mae: number; // mean absolute error: how far off, ignoring direction
}

export interface Metrics {
  n: number;
  matches: number;
  overall: GroupStat | null;
  byRole: Record<string, GroupStat>;
  byPitch: Record<string, GroupStat>;
  captainRegret: { n: number; mean: number | null }; // points lost by the captain pick versus the best player in the team
}

function stat(rows: CompareRow[]): GroupStat {
  const n = rows.length;
  const meanPredicted = rows.reduce((a, r) => a + r.predicted, 0) / n;
  const meanActual = rows.reduce((a, r) => a + r.actual, 0) / n;
  return {
    n,
    meanPredicted,
    meanActual,
    bias: meanPredicted - meanActual,
    mae: rows.reduce((a, r) => a + Math.abs(r.predicted - r.actual), 0) / n,
  };
}

function groupBy(rows: CompareRow[], key: (r: CompareRow) => string): Record<string, GroupStat> {
  const groups = new Map<string, CompareRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return Object.fromEntries([...groups].map(([k, rs]) => [k, stat(rs)]));
}

export function computeMetrics(rows: CompareRow[], captainRegrets: number[] = []): Metrics {
  return {
    n: rows.length,
    matches: new Set(rows.map((r) => r.matchId)).size,
    overall: rows.length ? stat(rows) : null,
    byRole: groupBy(rows, (r) => r.role),
    byPitch: groupBy(rows, (r) => r.pitch),
    captainRegret: {
      n: captainRegrets.length,
      mean: captainRegrets.length ? captainRegrets.reduce((a, b) => a + b, 0) / captainRegrets.length : null,
    },
  };
}

// ---------- Proposals ----------
export interface LearningSettings {
  minRows: number; // MIN_ROWS in the rubric: no proposals before this many compared players
  minRoleRows: number; // a role needs this many rows of its own
  minShift: number; // ignore errors smaller than this share (5% means 0.05)
  maxStep: number; // one cycle may move a value by at most this share (20% means 0.2)
  rate: number; // 1 = move the whole suggested step; 0.5 = half of it (automatic mode)
  minFactor: number; // a role correction never goes below this...
  maxFactor: number; // ...or above this
  minMatchesAuto: number; // automatic mode waits for this many matches of evidence before changing anything
}

export const DEFAULT_LEARNING: LearningSettings = {
  minRows: 20, minRoleRows: 8, minShift: 0.05, maxStep: 0.2, rate: 1, minFactor: 0.6, maxFactor: 1.4, minMatchesAuto: 3,
};

// Automatic mode: the same rules, but half steps.
export const AUTO_LEARNING: LearningSettings = { ...DEFAULT_LEARNING, rate: 0.5 };

export interface Proposal {
  parameter: string; // e.g. "calibration.BAT"
  role: Role;
  oldValue: number;
  newValue: number;
  evidence: { n: number; meanPredicted: number; meanActual: number; bias: number; mae: number };
  plainEnglish: string;
}

const ROLE_WORD: Record<Role, string> = { WK: "keepers", BAT: "batters", AR: "all-rounders", BOWL: "bowlers" };

// If a role's players score consistently lower (or higher) than predicted, scale that role's predictions.
// New factor = current factor x (mean actual / mean predicted), moved at most maxStep per cycle.
export function proposeCalibration(
  metrics: Metrics,
  current: Record<Role, number>,
  settings: LearningSettings = DEFAULT_LEARNING,
): Proposal[] {
  if (metrics.n < settings.minRows) return [];
  const out: Proposal[] = [];
  for (const [role, s] of Object.entries(metrics.byRole) as [Role, GroupStat][]) {
    if (s.n < settings.minRoleRows || s.meanPredicted <= 0) continue;
    const ratio = s.meanActual / s.meanPredicted;
    if (Math.abs(ratio - 1) < settings.minShift) continue;
    const capped = Math.max(1 - settings.maxStep, Math.min(1 + settings.maxStep, ratio));
    // `rate` below 1 moves only part of the way (automatic mode uses half steps, so it cannot over-swing).
    const step = 1 + (capped - 1) * settings.rate;
    const oldValue = current[role];
    // A correction is never allowed outside the safe range, however much evidence there is.
    const newValue = Math.round(Math.max(settings.minFactor, Math.min(settings.maxFactor, oldValue * step)) * 1000) / 1000;
    if (newValue === oldValue) continue;
    const pct = Math.round(Math.abs(newValue / oldValue - 1) * 100);
    out.push({
      parameter: `calibration.${role}`,
      role,
      oldValue,
      newValue,
      evidence: { n: s.n, meanPredicted: s.meanPredicted, meanActual: s.meanActual, bias: s.bias, mae: s.mae },
      plainEnglish: `Rate ${ROLE_WORD[role]} ${pct}% ${newValue < oldValue ? "lower" : "higher"}: across ${s.n} compared players they scored ${s.meanActual.toFixed(1)} on average but were predicted ${s.meanPredicted.toFixed(1)}.`,
    });
  }
  return out;
}
