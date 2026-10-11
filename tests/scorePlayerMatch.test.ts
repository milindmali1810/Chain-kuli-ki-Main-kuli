import { describe, it, expect } from "vitest";
import { POINTS_PROFILES } from "@/config/points";
import { scorePlayerMatch, type PlayerMatchStats } from "@/lib/scorePlayerMatch";

const standard = POINTS_PROFILES.standard;
const variant = POINTS_PROFILES.variant;

const score = (stats: PlayerMatchStats, table = standard) => scorePlayerMatch(stats, table).total;

const bat = (runs: number, balls: number, extra: Partial<PlayerMatchStats["batting"] extends (infer T)[] | undefined ? T : never> = {}) => ({
  runs, balls, fours: 0, sixes: 0, dismissed: true, ...extra,
});

describe("worked scorecards (standard profile) - check these with a calculator", () => {
  it("Example 1: batter, 52 off 30 with 5 fours, 2 sixes, 1 catch = 87", () => {
    // In playing XI ............................ +4
    // 52 runs x 1 .............................. +52
    // 5 fours x 1 (bonus on top of runs) ....... +5
    // 2 sixes x 2 (bonus on top of runs) ....... +4
    // 50-run bonus (replaces the 30-run bonus) . +8
    // Strike rate = 52 / 30 x 100 = 173.33 > 170 +6
    // 1 catch x 8 .............................. +8
    // Total = 4 + 52 + 5 + 4 + 8 + 6 + 8 = 87
    const result = scorePlayerMatch(
      {
        role: "BAT",
        inPlayingXI: true,
        batting: [bat(52, 30, { fours: 5, sixes: 2 })],
        fielding: [{ catches: 1, stumpings: 0, runOutsDirect: 0, runOutsShared: 0 }],
      },
      standard,
    );
    expect(result.total).toBe(87);
    expect(result.lines.map((l) => l.points)).toEqual([4, 52, 5, 4, 8, 6, 8]);
  });

  it("Example 2: bowler, 4 overs, 22 runs, 3 wickets (2 bowled/LBW), 1 maiden = 115", () => {
    // In playing XI ............................ +4
    // 3 wickets x 25 ........................... +75
    // 2 bowled/LBW x 8 ......................... +16
    // 3-wicket bonus ........................... +4
    // 1 maiden x 12 ............................ +12
    // Economy = 22 runs / 4 overs = 5.5 (5 to 5.99 band) +4
    // Total = 4 + 75 + 16 + 4 + 12 + 4 = 115
    // He also batted 0 off 2 and was out, but a bowler gets no duck penalty
    // and no strike-rate points, so batting adds nothing.
    const result = scorePlayerMatch(
      {
        role: "BOWL",
        inPlayingXI: true,
        batting: [bat(0, 2)],
        bowling: [{ balls: 24, runsConceded: 22, wickets: 3, bowledOrLbw: 2, maidens: 1 }],
      },
      standard,
    );
    expect(result.total).toBe(115);
    expect(result.lines.map((l) => l.points)).toEqual([4, 75, 16, 4, 12, 4]);
  });

  it("Example 3: all-rounder, duck, 1 wicket at economy 13, 3 catches, 1 direct run out = 61", () => {
    // In playing XI ............................ +4
    // Duck (AR is hit by the duck rule) ........ -2
    // 1 wicket x 25 ............................ +25
    // Economy = 39 runs / 3 overs = 13 (> 12) .. -6
    // 3 catches x 8 ............................ +24
    // 3-catch bonus ............................ +4
    // 1 direct-hit run out ..................... +12
    // Total = 4 - 2 + 25 - 6 + 24 + 4 + 12 = 61
    // Batting 0 off 3 balls: fewer than 10 balls, so no strike-rate penalty.
    const result = scorePlayerMatch(
      {
        role: "AR",
        inPlayingXI: true,
        batting: [bat(0, 3)],
        bowling: [{ balls: 18, runsConceded: 39, wickets: 1, bowledOrLbw: 0, maidens: 0 }],
        fielding: [{ catches: 3, stumpings: 0, runOutsDirect: 1, runOutsShared: 0 }],
      },
      standard,
    );
    expect(result.total).toBe(61);
  });

  it("Example 4: Super Over is ignored. WK 20 off 12 (2 fours, 1 six) + 1 stumping = 44", () => {
    // In playing XI ............................ +4
    // 20 runs x 1 .............................. +20
    // 2 fours x 1 .............................. +2
    // 1 six x 2 ................................ +2
    // No milestone (20 is below 30)
    // Strike rate = 20 / 12 x 100 = 166.67 (150.01 to 170 band, 12 balls >= 10) +4
    // 1 stumping x 12 .......................... +12
    // Total = 4 + 20 + 2 + 2 + 4 + 12 = 44
    // The Super Over (15 off 4 balls with 2 sixes, and a stumping) must add NOTHING.
    const result = scorePlayerMatch(
      {
        role: "WK",
        inPlayingXI: true,
        batting: [
          bat(20, 12, { fours: 2, sixes: 1 }),
          bat(15, 4, { sixes: 2, dismissed: false, superOver: true }),
        ],
        fielding: [
          { catches: 0, stumpings: 1, runOutsDirect: 0, runOutsShared: 0 },
          { catches: 2, stumpings: 1, runOutsDirect: 0, runOutsShared: 0, superOver: true },
        ],
      },
      standard,
    );
    expect(result.total).toBe(44);
  });
});

describe("scorePlayerMatch: rules in detail", () => {
  const xi = (extra: Partial<PlayerMatchStats>): PlayerMatchStats => ({ role: "BAT", inPlayingXI: true, ...extra });

  it("a player not in the playing XI scores 0 even if stats are present", () => {
    expect(score({ role: "BAT", inPlayingXI: false, batting: [bat(80, 40)] })).toBe(0);
  });

  it("a player with no stats gets only the playing-XI points", () => {
    expect(score(xi({}))).toBe(4);
  });

  describe("milestones never stack", () => {
    // Strike rate is kept in the dead zone (balls = runs, SR 100) so only runs + milestone count.
    it("29 runs: no bonus -> 4 + 29 = 33", () => expect(score(xi({ batting: [bat(29, 29)] }))).toBe(33));
    it("30 runs: +4 -> 4 + 30 + 4 = 38", () => expect(score(xi({ batting: [bat(30, 30)] }))).toBe(38));
    it("50 runs: +8 only (not 4 + 8) -> 4 + 50 + 8 = 62", () => expect(score(xi({ batting: [bat(50, 50)] }))).toBe(62));
    it("100 runs: +16 only -> 4 + 100 + 16 = 120", () => expect(score(xi({ batting: [bat(100, 100)] }))).toBe(120));
    it("4 wickets: +8 only (not 4 + 8) -> 4 + 100 + 8 = 112 at economy 8 (no band)", () => {
      expect(score(xi({ role: "BOWL", bowling: [{ balls: 24, runsConceded: 32, wickets: 4, bowledOrLbw: 0, maidens: 0 }] }))).toBe(112);
    });
    it("5 wickets: +16 only -> 4 + 125 + 16 = 145 at economy 8 (no band)", () => {
      expect(score(xi({ role: "BOWL", bowling: [{ balls: 24, runsConceded: 32, wickets: 5, bowledOrLbw: 0, maidens: 0 }] }))).toBe(145);
    });
  });

  describe("strike rate points", () => {
    it("needs at least 10 balls: 30 off 9 gets no strike-rate bonus", () => {
      // 4 + 30 + 4 (30-run bonus) = 38, no SR points even though SR = 333
      expect(score(xi({ batting: [bat(30, 9)] }))).toBe(38);
    });
    it("10 balls is enough: 20 off 10 = SR 200 -> 4 + 20 + 6 = 30", () => {
      expect(score(xi({ batting: [bat(20, 10)] }))).toBe(30);
    });
    it("bowlers are exempt: 30 off 12 (SR 250) -> 4 + 30 + 4 = 38, no SR bonus", () => {
      expect(score(xi({ role: "BOWL", batting: [bat(30, 12)] }))).toBe(38);
    });
    it("an all-rounder is not exempt: same innings -> 38 + 6 = 44", () => {
      expect(score(xi({ role: "AR", batting: [bat(30, 12)] }))).toBe(44);
    });
    it("bracket edges: SR 150 exactly is the +2 band, SR 150.01+ is the +4 band", () => {
      expect(score(xi({ batting: [bat(30, 20)] }))).toBe(4 + 30 + 4 + 2); // SR 150
      expect(score(xi({ batting: [bat(31, 20)] }))).toBe(4 + 31 + 4 + 4); // SR 155
    });
    it("penalty: 5 off 12 = SR 41.67 (< 50) -> 4 + 5 - 6 = 3", () => {
      expect(score(xi({ batting: [bat(5, 12)] }))).toBe(3);
    });
    it("penalty: 7 off 12 = SR 58.33 (50 to 59.99) -> 4 + 7 - 4 = 7", () => {
      expect(score(xi({ batting: [bat(7, 12)] }))).toBe(7);
    });
    it("penalty: 8 off 12 = SR 66.67 (60 to 70) -> 4 + 8 - 2 = 10", () => {
      expect(score(xi({ batting: [bat(8, 12)] }))).toBe(10);
    });
    it("SR 100 sits between the bands and scores nothing extra", () => {
      expect(score(xi({ batting: [bat(20, 20)] }))).toBe(24);
    });
  });

  describe("duck rules", () => {
    it("BAT out for 0 loses 2 -> 4 - 2 = 2", () => expect(score(xi({ batting: [bat(0, 3)] }))).toBe(2));
    it("WK out for 0 loses 2", () => expect(score(xi({ role: "WK", batting: [bat(0, 3)] }))).toBe(2));
    it("AR out for 0 loses 2", () => expect(score(xi({ role: "AR", batting: [bat(0, 3)] }))).toBe(2));
    it("BOWL out for 0 is not penalised -> 4", () => expect(score(xi({ role: "BOWL", batting: [bat(0, 3)] }))).toBe(4));
    it("BAT not out on 0 is not a duck -> 4", () => {
      expect(score(xi({ batting: [bat(0, 3, { dismissed: false })] }))).toBe(4);
    });
    it("BAT who did not bat has no duck -> 4", () => expect(score(xi({ batting: [] }))).toBe(4));
  });

  describe("economy points", () => {
    const spell = (balls: number, runsConceded: number) =>
      xi({ role: "BOWL", bowling: [{ balls, runsConceded, wickets: 0, bowledOrLbw: 0, maidens: 0 }] });

    it("needs at least 2 overs: 11 balls (1.5 overs) at economy 3 gets nothing -> 4", () => {
      expect(score(spell(11, 5))).toBe(4);
    });
    it("2 overs is enough: 12 balls, 8 runs = economy 4 (< 5) -> 4 + 6 = 10", () => {
      expect(score(spell(12, 8))).toBe(10);
    });
    it("economy exactly 7 is still the +2 band: 14 runs in 2 overs -> 6", () => {
      expect(score(spell(12, 14))).toBe(6);
    });
    it("economy 8 has no band -> 4", () => expect(score(spell(24, 32))).toBe(4));
    it("economy exactly 10 is -2: 20 runs in 2 overs -> 2", () => expect(score(spell(12, 20))).toBe(2));
    it("economy exactly 12 is -4: 24 runs in 2 overs -> 0", () => expect(score(spell(12, 24))).toBe(0));
    it("economy above 12 is -6: 26 runs in 2 overs = 13 -> -2", () => expect(score(spell(12, 26))).toBe(-2));
  });

  describe("fielding", () => {
    const field = (f: Partial<{ catches: number; stumpings: number; runOutsDirect: number; runOutsShared: number }>) =>
      xi({ role: "BOWL", fielding: [{ catches: 0, stumpings: 0, runOutsDirect: 0, runOutsShared: 0, ...f }] });

    it("2 catches = 16, no bonus -> 20", () => expect(score(field({ catches: 2 }))).toBe(20));
    it("3 catches = 24 + 4 bonus -> 32", () => expect(score(field({ catches: 3 }))).toBe(32));
    it("4 catches = 32 + 4 bonus (bonus paid once) -> 40", () => expect(score(field({ catches: 4 }))).toBe(40));
    it("shared run out = 6 each: 2 of them -> 4 + 12 = 16", () => expect(score(field({ runOutsShared: 2 }))).toBe(16));
  });

  describe("Super Over", () => {
    it("excludes super-over wickets and maidens too", () => {
      const stats = xi({
        role: "BOWL",
        bowling: [{ balls: 6, runsConceded: 3, wickets: 2, bowledOrLbw: 2, maidens: 1, superOver: true }],
      });
      expect(score(stats)).toBe(4);
    });
    it("counts super-over rows if the table says not to exclude them", () => {
      const keep = { ...standard, excludeSuperOver: { ...standard.excludeSuperOver, value: false } };
      const stats = xi({ batting: [bat(10, 10, { superOver: true })] });
      expect(score(stats, keep)).toBeGreaterThan(4);
    });
  });
});

describe("profiles give different answers where they should", () => {
  const stats: PlayerMatchStats = {
    role: "BAT",
    inPlayingXI: true,
    batting: [{ runs: 28, balls: 28, fours: 3, sixes: 2, dismissed: true }],
  };

  it("standard: 4 + 28 + 3x1 + 2x2 = 39 (28 runs is below the 30 bonus; SR 100 has no band)", () => {
    expect(score(stats, standard)).toBe(39);
  });

  it("variant: 4 + 28 + 3x4 + 2x6 + 4 (25-run bonus) = 60", () => {
    expect(score(stats, variant)).toBe(60);
  });

  it("variant has a 75-run bonus of 12 and standard does not: 75 off 75 -> 4 + 75 + 8 = 87 vs 4 + 75 + 12 = 91", () => {
    const seventyFive: PlayerMatchStats = { role: "BAT", inPlayingXI: true, batting: [bat(75, 75)] };
    expect(score(seventyFive, standard)).toBe(87);
    expect(score(seventyFive, variant)).toBe(91);
  });
});
