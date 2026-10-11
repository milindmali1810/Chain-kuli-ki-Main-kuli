// Seeded credits: NOT Dream11's real numbers. Dream11 does not publish them for free.
// A player's credit comes from where his recent average fantasy points rank among established players.

export const SEEDED_CREDITS = {
  min: 7.5,
  max: 11,
  step: 0.5,
} as const;

import type { Role } from "@/config/rules";
import { averagePoints, fantasyPointsSeries, type HistoryRow } from "./history";

export interface SeededCredit {
  credit: number | null; // null = no data, so no credit
  avg: number | null;
  matches: number;
}

// Prices the given players from history rows that are already limited to "before the match".
// Players are ranked against `referenceIds` (default: everyone with enough matches). For a real match the
// right reference is the players IN that match, as Dream11 prices relative to the match: ranking two strong
// international XIs against every associate-nation player would make nearly all of them expensive, and the
// cheapest legal team could cost more than the 100-credit cap.
export function seedCreditsFor(
  rows: HistoryRow[],
  roles: Map<number, Role>,
  playerIds: number[],
  referenceIds?: number[],
  minMatchesForReference = 8,
  lastN = 15,
): Map<number, SeededCredit> {
  const byPlayer = new Map<number, HistoryRow[]>();
  for (const r of rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);

  const stats = (id: number) => {
    const role = roles.get(id);
    if (!role) return { avg: null, n: 0 };
    const series = fantasyPointsSeries(byPlayer.get(id) ?? [], role);
    return { avg: averagePoints(series, lastN), n: series.length };
  };

  const reference: number[] = [];
  for (const id of referenceIds ?? byPlayer.keys()) {
    const { avg, n } = stats(id);
    if (avg !== null && n >= minMatchesForReference) reference.push(avg);
  }

  return new Map(
    playerIds.map((id) => {
      const { avg, n } = stats(id);
      return [id, { credit: seededCredit(avg, reference), avg, matches: n }];
    }),
  );
}

// Share of the reference group that scored less than avg (ties count half). 0 to 1.
export function percentileOf(avg: number, reference: number[]): number {
  if (reference.length === 0) return 0.5;
  const below = reference.filter((x) => x < avg).length;
  const equal = reference.filter((x) => x === avg).length;
  return (below + equal / 2) / reference.length;
}

// Best players cost 11, weakest established players 7.5, in steps of 0.5.
export function seededCredit(avg: number | null, reference: number[]): number | null {
  if (avg === null) return null; // no data, no credit: the player is left out, not priced at a guess
  const p = percentileOf(avg, reference);
  const steps = Math.round(p * ((SEEDED_CREDITS.max - SEEDED_CREDITS.min) / SEEDED_CREDITS.step));
  return SEEDED_CREDITS.min + steps * SEEDED_CREDITS.step;
}
