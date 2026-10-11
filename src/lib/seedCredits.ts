// Seeded credits: NOT Dream11's real numbers. Dream11 does not publish them for free.
// A player's credit comes from where his recent average fantasy points rank among established players.

export const SEEDED_CREDITS = {
  min: 7.5,
  max: 11,
  step: 0.5,
} as const;

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
