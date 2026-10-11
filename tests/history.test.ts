import { describe, it, expect } from "vitest";
import { averagePoints, fantasyPointsSeries, type HistoryRow } from "@/lib/history";
import { percentileOf, seedCreditsFor, seededCredit } from "@/lib/seedCredits";

const row = (matchId: number, date: string, stats: HistoryRow["stats"]): HistoryRow => ({
  playerId: 1, matchId, date, leagueTier: "international", teamId: 1, venueId: 1, stats,
});

// 52 off 30 with 5 fours and 2 sixes and a catch is worth 87 for a BAT (worked by hand in scorePlayerMatch.test.ts).
const big = {
  inPlayingXI: true,
  batting: [{ runs: 52, balls: 30, fours: 5, sixes: 2, dismissed: false }],
  fielding: [{ catches: 1, stumpings: 0, runOutsDirect: 0, runOutsShared: 0 }],
};
// A match with no batting, bowling or fielding is worth only the playing-XI 4 points.
const quiet = { inPlayingXI: true };

describe("fantasyPointsSeries", () => {
  it("scores each past match with the points table, oldest first", () => {
    const series = fantasyPointsSeries([row(2, "2026-03-02", quiet), row(1, "2026-03-01", big)], "BAT");
    expect(series.map((s) => [s.date, s.points])).toEqual([["2026-03-01", 87], ["2026-03-02", 4]]);
  });

  it("skips matches where he was not in the XI", () => {
    const series = fantasyPointsSeries([row(1, "2026-03-01", { inPlayingXI: false }), row(2, "2026-03-02", quiet)], "BAT");
    expect(series).toHaveLength(1);
  });
});

describe("averagePoints", () => {
  const series = fantasyPointsSeries([row(1, "2026-03-01", big), row(2, "2026-03-02", quiet), row(3, "2026-03-03", quiet)], "BAT");
  it("averages the last n matches: (87 + 4 + 4) / 3 = 31.67", () => {
    expect(averagePoints(series, 3)).toBeCloseTo(31.667, 2);
  });
  it("only the most recent n count: last 2 = (4 + 4) / 2 = 4", () => {
    expect(averagePoints(series, 2)).toBe(4);
  });
  it("no matches: null, not zero", () => {
    expect(averagePoints([], 15)).toBeNull();
  });
});

describe("seedCreditsFor: ranked against the players in the match", () => {
  // Eight players with steady averages, one per row set: Player n scores a quiet 4 plus n x 10 runs-worth of points.
  const rowsFor = (id: number): HistoryRow[] =>
    Array.from({ length: 8 }, (_, m) => row(id * 100 + m, `2026-01-${String(m + 1).padStart(2, "0")}`, {
      inPlayingXI: true,
      batting: [{ runs: id * 10, balls: id * 10, fours: 0, sixes: 0, dismissed: true }],
    })).map((r) => ({ ...r, playerId: id }));
  const rows = [1, 2, 3, 4, 5].flatMap(rowsFor);
  const roles = new Map<number, "BAT">([1, 2, 3, 4, 5].map((id) => [id, "BAT"]));

  it("the best of the group costs 11 and the weakest 7.5, whatever the absolute level", () => {
    const priced = seedCreditsFor(rows, roles, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    expect(priced.get(5)!.credit).toBe(10.5); // top of 5: percentile 0.9
    expect(priced.get(1)!.credit).toBe(8); // bottom of 5: percentile 0.1
  });

  it("a player with no role gets no credit, never a guess", () => {
    const priced = seedCreditsFor(rows, new Map(), [1], [1]);
    expect(priced.get(1)).toEqual({ credit: null, avg: null, matches: 0 });
  });
});

describe("seeded credits", () => {
  const reference = Array.from({ length: 101 }, (_, i) => i); // 0..100

  it("percentile counts ties as half", () => {
    expect(percentileOf(5, [1, 5, 5, 9])).toBe(0.5); // below 1, equal 2 -> (1 + 1) / 4
  });
  it("the top player costs 11 and the weakest costs 7.5", () => {
    expect(seededCredit(100, reference)).toBe(11);
    expect(seededCredit(0, reference)).toBe(7.5);
  });
  it("a middling player is in between and on a 0.5 step", () => {
    expect(seededCredit(50, reference)).toBe(9.5);
  });
  it("above the whole group still caps at 11", () => {
    expect(seededCredit(500, reference)).toBe(11);
  });
  it("no history means no credit (left out, not guessed)", () => {
    expect(seededCredit(null, reference)).toBeNull();
  });
});
