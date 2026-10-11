import { RUBRIC, type RubricConfig } from "@/config/rubric";
import type { Role } from "@/config/rules";
import type { HistoryRow } from "./history";

// Steps 2 and 3 of the expected-points model: how the ground and the team's recent run affect a player.
// Everything is computed from stats rows that were played BEFORE the match being predicted.

// A team's batting total in one match: the sum of its players' runs (extras are not in our rows, so totals
// are a little low, but the same way for every team, which is what comparisons need). Super Over excluded.
export interface TeamInnings {
  matchId: number;
  date: string;
  teamId: number;
  venueId: number | null;
  tier: string;
  runs: number;
}

export function teamInnings(rows: HistoryRow[]): TeamInnings[] {
  const byKey = new Map<string, TeamInnings>();
  for (const r of rows) {
    if (r.teamId === null) continue;
    const key = `${r.matchId}:${r.teamId}`;
    let t = byKey.get(key);
    if (!t) byKey.set(key, (t = { matchId: r.matchId, date: r.date, teamId: r.teamId, venueId: r.venueId, tier: r.leagueTier, runs: 0 }));
    for (const inn of r.stats.batting ?? []) if (!inn.superOver) t.runs += inn.runs;
  }
  return [...byKey.values()];
}

// Who won, judged by batting totals. An approximation (it ignores extras and rain rules); null = tie.
export interface MatchResult {
  matchId: number;
  date: string;
  teams: [number, number];
  winnerTeamId: number | null;
}

export function matchResults(innings: TeamInnings[]): MatchResult[] {
  const byMatch = new Map<number, TeamInnings[]>();
  for (const t of innings) byMatch.set(t.matchId, [...(byMatch.get(t.matchId) ?? []), t]);
  const out: MatchResult[] = [];
  for (const [matchId, pair] of byMatch) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    out.push({
      matchId,
      date: a.date,
      teams: [a.teamId, b.teamId],
      winnerTeamId: a.runs === b.runs ? null : a.runs > b.runs ? a.teamId : b.teamId,
    });
  }
  return out;
}

// ---------- Venue ----------
export interface VenueIndex {
  index: number; // 0.10 means 10% more runs than the competition average
  matches: number;
}

// Each innings is compared with the average innings of its own competition tier, so IPL grounds are not
// called "high scoring" just because the IPL is.
export function venueIndices(innings: TeamInnings[]): Map<number, VenueIndex> {
  const tierRuns = new Map<string, number[]>();
  for (const t of innings) tierRuns.set(t.tier, [...(tierRuns.get(t.tier) ?? []), t.runs]);
  const tierMean = new Map([...tierRuns].map(([tier, xs]) => [tier, xs.reduce((a, b) => a + b, 0) / xs.length]));

  const perVenue = new Map<number, { ratios: number[]; matchIds: Set<number> }>();
  for (const t of innings) {
    const mean = tierMean.get(t.tier);
    if (t.venueId === null || !mean) continue;
    const v = perVenue.get(t.venueId) ?? { ratios: [], matchIds: new Set<number>() };
    v.ratios.push(t.runs / mean);
    v.matchIds.add(t.matchId);
    perVenue.set(t.venueId, v);
  }
  return new Map(
    [...perVenue].map(([venueId, v]) => [
      venueId,
      { index: v.ratios.reduce((a, b) => a + b, 0) / v.ratios.length - 1, matches: v.matchIds.size },
    ]),
  );
}

export type PitchTag = "HIGH_SCORING" | "LOW_SCORING" | "NEUTRAL";
export interface Pitch {
  tag: PitchTag;
  lowConfidence: boolean;
  index: number | null;
  matches: number;
}

export function pitchTag(v: VenueIndex | undefined, cfg: RubricConfig = RUBRIC): Pitch {
  if (!v) return { tag: "NEUTRAL", lowConfidence: true, index: null, matches: 0 };
  const hi = cfg.venue.batEnvHi.value;
  const tag: PitchTag = v.index >= hi ? "HIGH_SCORING" : v.index <= -hi ? "LOW_SCORING" : "NEUTRAL";
  return { tag, lowConfidence: v.matches < cfg.venue.minMatches.value, index: v.index, matches: v.matches };
}

// High-scoring grounds help batters, low-scoring grounds help bowlers. All-rounders get half.
// Spin or pace friendliness is NOT used: we have no bowling-type data.
export function venueMultiplier(role: Role, pitch: Pitch, cfg: RubricConfig = RUBRIC): number {
  const a = cfg.venue.adj.value * (pitch.lowConfidence ? cfg.venue.lowConfidenceFactor.value : 1);
  const batter = role === "BAT" || role === "WK";
  if (pitch.tag === "HIGH_SCORING") return 1 + (batter ? a : role === "AR" ? a / 2 : 0);
  if (pitch.tag === "LOW_SCORING") return 1 + (role === "BOWL" ? a : role === "AR" ? a / 2 : 0);
  return 1;
}

// ---------- Team form (soft, capped, never a win prediction) ----------
export interface FormResult {
  date: string;
  won: 0 | 0.5 | 1;
}

export function teamResultsFor(results: MatchResult[], teamId: number): FormResult[] {
  return results
    .filter((r) => r.teams.includes(teamId))
    .map((r) => ({ date: r.date, won: (r.winnerTeamId === null ? 0.5 : r.winnerTeamId === teamId ? 1 : 0) as 0 | 0.5 | 1 }));
}

export interface TeamForm {
  index: number | null; // -0.5 (lost everything) to +0.5 (won everything); null = too few matches
  multiplier: number; // never further than the cap from 1
  matches: number;
}

export function teamFormFactor(results: FormResult[], cfg: RubricConfig = RUBRIC): TeamForm {
  const recent = [...results].sort((a, b) => a.date.localeCompare(b.date)).slice(-cfg.teamForm.matches.value);
  if (recent.length < cfg.teamForm.minMatches.value) return { index: null, multiplier: 1, matches: recent.length };
  const decay = cfg.teamForm.decay.value;
  let num = 0;
  let den = 0;
  recent.forEach((r, i) => {
    const w = decay ** (recent.length - 1 - i); // newest match has weight 1
    num += w * r.won;
    den += w;
  });
  const index = num / den - 0.5;
  return { index, multiplier: 1 + cfg.teamForm.cap.value * (index / 0.5), matches: recent.length };
}
