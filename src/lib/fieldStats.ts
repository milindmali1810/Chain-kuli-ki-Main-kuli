// How good is the agent's team compared with simple alternatives? Stored with every backtest so the Learning screen can
// show it. A legal team has to fit the credit cap and the role limits, which drags ANY legal team below the average
// player of the match, so the fair yardstick is a RANDOM LEGAL team, not the plain average.

import type { RulesProfile } from "@/config/rules";
import { selectTeam, type Candidate } from "./selectTeam";

export interface FieldStats {
  n: number; // players in the two playing XIs with known points
  pickedAvg: number; // average real points per player of the agent's 11
  fieldAvg: number; // average real points of every player in the two XIs
  randomLegalAvg: number | null; // average over random legal teams from the same pool; null if none could be built
  samples: number;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

// Deterministic generator so the same match always gets the same answer.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function fieldStats(input: {
  pickedIds: number[];
  pool: Candidate[]; // the players the agent could choose from
  actualOf: (id: number) => number; // real points; 0 for a player who did not play
  fieldPoints: number[]; // real points of every player in the playing XIs
  rules: RulesProfile;
  samples?: number;
  seed?: number;
}): FieldStats {
  const samples = input.samples ?? 20;
  const rand = lcg(input.seed ?? 12345);
  const avgs: number[] = [];
  for (let k = 0; k < samples; k++) {
    // Random scores make the optimiser return a random legal team instead of the best one.
    const team = selectTeam(input.pool.map((c) => { const x = rand(); return { ...c, expected: x, expectedIfPlays: x }; }), input.rules);
    if (team) avgs.push(mean(team.players.map((c) => input.actualOf(c.id))));
  }
  return {
    n: input.fieldPoints.length,
    pickedAvg: mean(input.pickedIds.map(input.actualOf)),
    fieldAvg: mean(input.fieldPoints),
    randomLegalAvg: avgs.length ? mean(avgs) : null,
    samples: avgs.length,
  };
}

// The edge over a baseline per match, as points per player: positive = the agent did better.
export function edgeOver(stats: Pick<FieldStats, "pickedAvg" | "fieldAvg" | "randomLegalAvg">[], baseline: "field" | "random"): number[] {
  return stats.flatMap((s) => {
    const b = baseline === "field" ? s.fieldAvg : s.randomLegalAvg;
    return b === null ? [] : [s.pickedAvg - b];
  });
}
