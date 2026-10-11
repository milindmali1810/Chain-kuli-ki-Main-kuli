import { describe, it, expect } from "vitest";
import { inferRole, type StatsNoRole } from "@/lib/inferRole";

// Builds n match rows with the same pattern each time.
function rows(
  n: number,
  p: { batBalls?: number; bowlBalls?: number; stumpings?: number; superOverStumpings?: number; inXI?: boolean },
): StatsNoRole[] {
  return Array.from({ length: n }, () => ({
    inPlayingXI: p.inXI ?? true,
    batting: p.batBalls ? [{ runs: 10, balls: p.batBalls, fours: 0, sixes: 0, dismissed: true }] : [],
    bowling: p.bowlBalls
      ? [{ balls: p.bowlBalls, runsConceded: 20, wickets: 0, bowledOrLbw: 0, maidens: 0 }]
      : [],
    fielding: [
      ...(p.stumpings ? [{ catches: 0, stumpings: p.stumpings, runOutsDirect: 0, runOutsShared: 0 }] : []),
      ...(p.superOverStumpings
        ? [{ catches: 0, stumpings: p.superOverStumpings, runOutsDirect: 0, runOutsShared: 0, superOver: true }]
        : []),
    ],
  }));
}

describe("inferRole", () => {
  it("too few matches: no role (never invented)", () => {
    expect(inferRole(rows(4, { batBalls: 20 }))).toBeNull();
  });

  it("matches where he was not in the XI do not count towards the minimum", () => {
    expect(inferRole([...rows(4, { batBalls: 20 }), ...rows(10, { inXI: false })])).toBeNull();
  });

  it("2 stumpings in the window: WK", () => {
    expect(inferRole([...rows(1, { batBalls: 15, stumpings: 2 }), ...rows(9, { batBalls: 15 })])).toBe("WK");
  });

  it("1 stumping is not enough to call him a keeper", () => {
    expect(inferRole([...rows(1, { batBalls: 15, stumpings: 1 }), ...rows(9, { batBalls: 15 })])).toBe("BAT");
  });

  it("Super Over stumpings are ignored", () => {
    expect(inferRole(rows(10, { batBalls: 15, superOverStumpings: 1 }))).toBe("BAT");
  });

  it("never bowls: BAT", () => {
    expect(inferRole(rows(10, { batBalls: 25 }))).toBe("BAT");
  });

  it("bowls only one over now and then: still BAT (part-timer)", () => {
    expect(inferRole(rows(10, { batBalls: 25, bowlBalls: 6 }))).toBe("BAT");
  });

  it("bowls 4 overs and barely bats: BOWL", () => {
    expect(inferRole(rows(10, { batBalls: 3, bowlBalls: 24 }))).toBe("BOWL");
  });

  it("bowls 4 overs and does not bat in most matches: BOWL", () => {
    expect([...rows(3, { batBalls: 15, bowlBalls: 24 }), ...rows(7, { bowlBalls: 24 })]).toHaveLength(10);
    expect(inferRole([...rows(3, { batBalls: 15, bowlBalls: 24 }), ...rows(7, { bowlBalls: 24 })])).toBe("BOWL");
  });

  it("bowls 3 overs and bats 12 balls in every match: AR", () => {
    expect(inferRole(rows(10, { batBalls: 12, bowlBalls: 18 }))).toBe("AR");
  });

  it("does not need the stumping rule to be a plain batter", () => {
    expect(inferRole(rows(10, { batBalls: 30 }))).toBe("BAT");
  });
});
