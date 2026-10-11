import { describe, it, expect } from "vitest";
import { parseMatch, phaseOfOver, type CsMatch } from "@/lib/cricsheet";

// A tiny made-up match so every number can be checked by hand.
// Team X bats against Team Y, then there is a Super Over.
//
// Over 0, bowled by Y1:
//   ball 1  X1 hits a four
//   ball 2  X1 hits a six
//   ball 3  WIDE (1 run). Not a ball faced, not a legal ball
//   ball 4  X1 takes a single
//   ball 5  X2 caught by Y2, bowler Y1
//   ball 6  X3 bowled by Y1
//   ball 7  X1 faces, 0 off the bat, 1 leg-bye (not charged to the bowler)
//   -> legal balls 6 (balls 1,2,4,5,6,7); runs charged to Y1 = 4+6+1+1+0+0+0 = 12; not a maiden
// Over 1, bowled by Y3: six dot balls to X1 -> a maiden
// Over 2, bowled by Y2:
//   ball 1  X4 stumped by Y3
//   ball 2  X1 takes 1 run, then is run out by Y4 alone (direct hit)
//   ball 3  X5 run out, fielders Y3 and Y4 (shared)
// Super Over, bowled by X1: Y1 hits a six off one ball.
const dot = (batter: string, bowler: string) => ({
  batter,
  bowler,
  runs: { batter: 0, extras: 0, total: 0 },
});

const fixture: CsMatch = {
  info: {
    dates: ["2026-01-05"],
    teams: ["Team X", "Team Y"],
    gender: "male",
    match_type: "T20",
    venue: "Test Ground",
    city: "Testville",
    event: { name: "Test Series" },
    toss: { winner: "Team X", decision: "bat" },
    outcome: { winner: "Team Y" },
    players: {
      "Team X": ["X1", "X2", "X3", "X4", "X5"],
      "Team Y": ["Y1", "Y2", "Y3", "Y4"],
    },
    registry: {
      people: {
        X1: "id-x1", X2: "id-x2", X3: "id-x3", X4: "id-x4", X5: "id-x5",
        Y1: "id-y1", Y2: "id-y2", Y3: "id-y3", Y4: "id-y4",
      },
    },
  },
  innings: [
    {
      team: "Team X",
      overs: [
        {
          over: 0,
          deliveries: [
            { batter: "X1", bowler: "Y1", runs: { batter: 4, extras: 0, total: 4 } },
            { batter: "X1", bowler: "Y1", runs: { batter: 6, extras: 0, total: 6 } },
            { batter: "X1", bowler: "Y1", runs: { batter: 0, extras: 1, total: 1 }, extras: { wides: 1 } },
            { batter: "X1", bowler: "Y1", runs: { batter: 1, extras: 0, total: 1 } },
            {
              batter: "X2", bowler: "Y1", runs: { batter: 0, extras: 0, total: 0 },
              wickets: [{ player_out: "X2", kind: "caught", fielders: [{ name: "Y2" }] }],
            },
            {
              batter: "X3", bowler: "Y1", runs: { batter: 0, extras: 0, total: 0 },
              wickets: [{ player_out: "X3", kind: "bowled" }],
            },
            { batter: "X1", bowler: "Y1", runs: { batter: 0, extras: 1, total: 1 }, extras: { legbyes: 1 } },
          ],
        },
        { over: 1, deliveries: Array.from({ length: 6 }, () => dot("X1", "Y3")) },
        {
          over: 2,
          deliveries: [
            {
              batter: "X4", bowler: "Y2", runs: { batter: 0, extras: 0, total: 0 },
              wickets: [{ player_out: "X4", kind: "stumped", fielders: [{ name: "Y3" }] }],
            },
            {
              batter: "X1", bowler: "Y2", runs: { batter: 1, extras: 0, total: 1 },
              wickets: [{ player_out: "X1", kind: "run out", fielders: [{ name: "Y4" }] }],
            },
            {
              batter: "X5", bowler: "Y2", runs: { batter: 0, extras: 0, total: 0 },
              wickets: [{ player_out: "X5", kind: "run out", fielders: [{ name: "Y3" }, { name: "Y4" }] }],
            },
          ],
        },
      ],
    },
    {
      team: "Team Y",
      super_over: true,
      overs: [{ over: 0, deliveries: [{ batter: "Y1", bowler: "X1", runs: { batter: 6, extras: 0, total: 6 } }] }],
    },
  ],
};

const parsed = parseMatch(fixture);
const line = (name: string) => parsed.lines.find((l) => l.name === name)!;

describe("parseMatch: match facts", () => {
  it("reads the basics", () => {
    expect(parsed).toMatchObject({
      date: "2026-01-05",
      teams: ["Team X", "Team Y"],
      gender: "male",
      matchType: "T20",
      venue: "Test Ground",
      city: "Testville",
      tossWinner: "Team X",
      tossDecision: "bat",
      winner: "Team Y",
    });
  });

  it("makes one line per player in the playing lists, all marked in the XI", () => {
    expect(parsed.lines).toHaveLength(9);
    expect(parsed.lines.every((l) => l.stats.inPlayingXI)).toBe(true);
    expect(line("X1").cricsheetId).toBe("id-x1");
    expect(line("Y3").team).toBe("Team Y");
  });
});

describe("parseMatch: batting", () => {
  it("X1: 12 runs off 11 balls, 1 four, 1 six, run out (the wide is not a ball faced)", () => {
    // balls: over0 -> 4 (balls 1,2,4,7); over1 -> 6; over2 -> 1  = 11
    // runs: 4 + 6 + 1 + 0 (leg-bye is not the batter's) + 0 x6 + 1 = 12
    expect(line("X1").stats.batting).toEqual([
      { runs: 12, balls: 11, fours: 1, sixes: 1, dismissed: true },
    ]);
  });

  it("X2 and X3 are dismissed on their only ball", () => {
    expect(line("X2").stats.batting).toEqual([{ runs: 0, balls: 1, fours: 0, sixes: 0, dismissed: true }]);
    expect(line("X3").stats.batting).toEqual([{ runs: 0, balls: 1, fours: 0, sixes: 0, dismissed: true }]);
  });

  it("the Super Over innings is kept but flagged", () => {
    expect(line("Y1").stats.batting).toEqual([
      { runs: 6, balls: 1, fours: 0, sixes: 1, dismissed: false, superOver: true },
    ]);
  });
});

describe("parseMatch: bowling", () => {
  it("Y1: 6 legal balls, 12 runs charged (wide counts, leg-bye does not), 2 wickets, 1 bowled", () => {
    expect(line("Y1").stats.bowling).toEqual([
      { balls: 6, runsConceded: 12, wickets: 2, bowledOrLbw: 1, maidens: 0 },
    ]);
  });

  it("Y3 bowled a maiden", () => {
    expect(line("Y3").stats.bowling).toEqual([
      { balls: 6, runsConceded: 0, wickets: 0, bowledOrLbw: 0, maidens: 1 },
    ]);
  });

  it("Y2: a stumping is a wicket for the bowler, a run out is not", () => {
    expect(line("Y2").stats.bowling).toEqual([
      { balls: 3, runsConceded: 1, wickets: 1, bowledOrLbw: 0, maidens: 0 },
    ]);
  });

  it("the Super Over spell is flagged", () => {
    expect(line("X1").stats.bowling).toEqual([
      { balls: 1, runsConceded: 6, wickets: 0, bowledOrLbw: 0, maidens: 0, superOver: true },
    ]);
  });
});

describe("parseMatch: fielding", () => {
  it("catch, stumping, direct and shared run outs go to the right fielders", () => {
    expect(line("Y2").stats.fielding).toEqual([{ catches: 1, stumpings: 0, runOutsDirect: 0, runOutsShared: 0 }]);
    expect(line("Y3").stats.fielding).toEqual([{ catches: 0, stumpings: 1, runOutsDirect: 0, runOutsShared: 1 }]);
    expect(line("Y4").stats.fielding).toEqual([{ catches: 0, stumpings: 0, runOutsDirect: 1, runOutsShared: 1 }]);
  });
});

describe("parseMatch: phases", () => {
  it("overs 1-6 are powerplay, 7-16 middle, 17-20 death", () => {
    expect([0, 5, 6, 15, 16, 19].map(phaseOfOver)).toEqual([
      "powerplay", "powerplay", "middle", "middle", "death", "death",
    ]);
  });

  it("X1 batting phases ignore the Super Over", () => {
    expect(line("X1").phases.bat.powerplay).toEqual({ balls: 11, runs: 12, dismissals: 1 });
    expect(line("X1").phases.bat.middle.balls).toBe(0);
  });

  it("Y1 bowling phases: 6 balls, 12 runs, 2 wickets, none from the Super Over", () => {
    expect(line("Y1").phases.bowl.powerplay).toEqual({ balls: 6, runs: 12, wickets: 2 });
    expect(line("Y1").phases.bat.powerplay.balls).toBe(0); // his Super Over six is not in any phase
  });
});
