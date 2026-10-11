import { RUBRIC, type RubricConfig } from "@/config/rubric";
import type { Role } from "@/config/rules";
import type { PointsEntry } from "./history";

// Step 1 of the expected-points model: a player's base form from his own recent fantasy points.

export interface BaseForm {
  base: number | null; // null = no history, shown as "unavailable"
  recentMean: number | null;
  longMean: number | null;
  effectiveN: number; // how much evidence there is (matches, weighted by competition quality)
  matches: number;
}

function tierWeight(tier: string, cfg: RubricConfig): number {
  const w = cfg.form.tierWeight as Record<string, { value: number }>;
  return (w[tier] ?? cfg.form.tierWeight.domestic).value;
}

// Matches in better competitions count for more.
function weightedMean(entries: PointsEntry[], cfg: RubricConfig): { mean: number | null; weight: number } {
  const weight = entries.reduce((a, e) => a + tierWeight(e.leagueTier, cfg), 0);
  if (weight === 0) return { mean: null, weight: 0 };
  return { mean: entries.reduce((a, e) => a + tierWeight(e.leagueTier, cfg) * e.points, 0) / weight, weight };
}

// Blend of the recent matches (RECENT_W) and the longer record. `series` must be oldest first.
export function baseForm(series: PointsEntry[], cfg: RubricConfig = RUBRIC): BaseForm {
  const long = series.slice(-cfg.form.longMatches.value);
  const recent = series.slice(-cfg.form.recentMatches.value);
  const L = weightedMean(long, cfg);
  const R = weightedMean(recent, cfg);
  if (L.mean === null || R.mean === null) {
    return { base: null, recentMean: null, longMean: null, effectiveN: 0, matches: 0 };
  }
  const rw = cfg.form.recentWeight.value;
  return {
    base: rw * R.mean + (1 - rw) * L.mean,
    recentMean: R.mean,
    longMean: L.mean,
    effectiveN: L.weight,
    matches: long.length,
  };
}

// Thin histories are pulled toward the role average: little evidence means trust the prior more.
export function shrinkToPrior(base: number, effectiveN: number, prior: number, k: number): number {
  return (effectiveN * base + k * prior) / (effectiveN + k);
}

// Average base form by role among established players (enough evidence).
export function rolePriors(
  items: { role: Role; base: number; effectiveN: number }[],
  minN = 8,
): Record<Role, number> {
  const established = items.filter((i) => i.effectiveN >= minN);
  const mean = (xs: { base: number }[]) => (xs.length === 0 ? 0 : xs.reduce((a, x) => a + x.base, 0) / xs.length);
  const overall = mean(established);
  const priorFor = (role: Role) => {
    const same = established.filter((i) => i.role === role);
    return same.length === 0 ? overall : mean(same);
  };
  return { WK: priorFor("WK"), BAT: priorFor("BAT"), AR: priorFor("AR"), BOWL: priorFor("BOWL") };
}
