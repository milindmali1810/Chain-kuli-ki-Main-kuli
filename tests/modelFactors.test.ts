import { describe, it, expect } from "vitest";
import { baseForm, rolePriors, shrinkToPrior } from "@/lib/expectedPoints";
import { deathBaseline, deathProfile } from "@/lib/deathBowler";
import {
  matchResults, pitchTag, teamFormFactor, teamInnings, teamResultsFor, venueIndices, venueMultiplier,
} from "@/lib/matchContext";
import type { HistoryRow, PointsEntry } from "@/lib/history";

const entry = (points: number, leagueTier = "international", i = 0): PointsEntry => ({
  matchId: i, date: `2026-01-${String(i + 1).padStart(2, "0")}`, leagueTier, points,
});

describe("baseForm", () => {
  it("no history: unavailable, never zero", () => {
    expect(baseForm([]).base).toBeNull();
  });

  it("steady 20s give 20", () => {
    const b = baseForm([20, 20, 20, 20].map((p, i) => entry(p, "international", i)));
    expect(b.base).toBe(20);
    expect(b.effectiveN).toBe(4);
  });

  it("weights the competition: domestic 10 (x0.6) and international 20 (x1) -> (6 + 20) / 1.6 = 16.25", () => {
    const b = baseForm([entry(10, "domestic", 0), entry(20, "international", 1)]);
    expect(b.base).toBeCloseTo(16.25, 6);
    expect(b.effectiveN).toBeCloseTo(1.6, 6);
  });

  it("blends recent (40%) and long (60%): 22 matches of 10 then 8 of 30 -> 0.4 x 30 + 0.6 x 15.333 = 21.2", () => {
    const series = [...Array(22).fill(10), ...Array(8).fill(30)].map((p, i) => entry(p, "international", i));
    const b = baseForm(series);
    expect(b.recentMean).toBe(30);
    expect(b.longMean).toBeCloseTo(15.3333, 3);
    expect(b.base).toBeCloseTo(21.2, 6);
  });
});

describe("shrinkToPrior and rolePriors", () => {
  it("40 with 10 matches of evidence and a prior of 20 (k = 10) -> (400 + 200) / 20 = 30", () => {
    expect(shrinkToPrior(40, 10, 20, 10)).toBe(30);
  });
  it("thin evidence leans on the prior: 40 with 1 match -> (40 + 200) / 11 = 21.82", () => {
    expect(shrinkToPrior(40, 1, 20, 10)).toBeCloseTo(21.818, 2);
  });
  it("priors are role averages of established players only; empty roles fall back to the overall mean", () => {
    const p = rolePriors([
      { role: "BAT", base: 30, effectiveN: 20 },
      { role: "BAT", base: 10, effectiveN: 20 },
      { role: "BAT", base: 99, effectiveN: 3 }, // too thin, ignored
    ]);
    expect(p.BAT).toBe(20);
    expect(p.BOWL).toBe(20);
  });
});

// ---------- match context ----------
const lineRow = (matchId: number, teamId: number, runs: number, extra: Partial<HistoryRow> = {}, superRuns = 0): HistoryRow => ({
  playerId: matchId * 100 + teamId, matchId, date: "2026-02-01", leagueTier: "international", teamId, venueId: 1,
  stats: {
    inPlayingXI: true,
    batting: [
      { runs, balls: 20, fours: 0, sixes: 0, dismissed: true },
      ...(superRuns ? [{ runs: superRuns, balls: 3, fours: 0, sixes: 0, dismissed: false, superOver: true }] : []),
    ],
  },
  ...extra,
});

describe("teamInnings and matchResults", () => {
  it("adds up a team's batters and ignores the Super Over", () => {
    const rows = [lineRow(1, 10, 50), lineRow(1, 10, 60, { playerId: 999 }, 25), lineRow(1, 20, 30), lineRow(1, 20, 40, { playerId: 998 })];
    const t = teamInnings(rows);
    expect(t.find((x) => x.teamId === 10)!.runs).toBe(110);
    expect(t.find((x) => x.teamId === 20)!.runs).toBe(70);
    expect(matchResults(t)).toEqual([{ matchId: 1, date: "2026-02-01", teams: [10, 20], winnerTeamId: 10 }]);
  });

  it("equal totals are a tie (null winner)", () => {
    const r = matchResults(teamInnings([lineRow(1, 10, 100), lineRow(1, 20, 100)]));
    expect(r[0].winnerTeamId).toBeNull();
  });
});

describe("venue index and pitch tags", () => {
  // Competition average = (150 + 150 + 120 + 120) / 4 = 135. Venue 1: 150/135 = +11.1%. Venue 2: 120/135 = -11.1%.
  const innings = [
    { matchId: 1, date: "d", teamId: 1, venueId: 1, tier: "international", runs: 150 },
    { matchId: 1, date: "d", teamId: 2, venueId: 1, tier: "international", runs: 150 },
    { matchId: 2, date: "d", teamId: 1, venueId: 2, tier: "international", runs: 120 },
    { matchId: 2, date: "d", teamId: 2, venueId: 2, tier: "international", runs: 120 },
  ];
  const idx = venueIndices(innings);

  it("compares each ground with its own competition average", () => {
    expect(idx.get(1)!.index).toBeCloseTo(0.1111, 3);
    expect(idx.get(2)!.index).toBeCloseTo(-0.1111, 3);
    expect(idx.get(1)!.matches).toBe(1);
  });

  it("tags the extremes, and marks a 1-match sample low confidence", () => {
    expect(pitchTag(idx.get(1))).toMatchObject({ tag: "HIGH_SCORING", lowConfidence: true });
    expect(pitchTag(idx.get(2))).toMatchObject({ tag: "LOW_SCORING" });
    expect(pitchTag(undefined)).toMatchObject({ tag: "NEUTRAL", lowConfidence: true });
  });

  it("a 10-match record is trusted: +11% is HIGH_SCORING and not low confidence", () => {
    expect(pitchTag({ index: 0.11, matches: 10 })).toMatchObject({ tag: "HIGH_SCORING", lowConfidence: false });
    expect(pitchTag({ index: 0.05, matches: 10 }).tag).toBe("NEUTRAL");
  });

  it("multipliers: batters +5% on a high-scoring ground, bowlers +5% on a low-scoring one, all-rounders half", () => {
    const high = { tag: "HIGH_SCORING" as const, lowConfidence: false, index: 0.1, matches: 10 };
    const low = { tag: "LOW_SCORING" as const, lowConfidence: false, index: -0.1, matches: 10 };
    expect(venueMultiplier("BAT", high)).toBeCloseTo(1.05, 6);
    expect(venueMultiplier("WK", high)).toBeCloseTo(1.05, 6);
    expect(venueMultiplier("AR", high)).toBeCloseTo(1.025, 6);
    expect(venueMultiplier("BOWL", high)).toBe(1);
    expect(venueMultiplier("BOWL", low)).toBeCloseTo(1.05, 6);
    expect(venueMultiplier("BAT", low)).toBe(1);
  });

  it("thin venue history halves the effect: 1.05 becomes 1.025", () => {
    expect(venueMultiplier("BAT", { tag: "HIGH_SCORING", lowConfidence: true, index: 0.1, matches: 2 })).toBeCloseTo(1.025, 6);
  });
});

describe("teamFormFactor", () => {
  const r = (d: number, won: 0 | 0.5 | 1) => ({ date: `2026-01-${String(d).padStart(2, "0")}`, won });

  it("fewer than 3 matches: neutral and index unavailable", () => {
    expect(teamFormFactor([r(1, 1), r(2, 1)])).toEqual({ index: null, multiplier: 1, matches: 2 });
  });
  it("won everything: +8% (the cap)", () => {
    expect(teamFormFactor([r(1, 1), r(2, 1), r(3, 1)]).multiplier).toBeCloseTo(1.08, 6);
  });
  it("lost everything: -8%", () => {
    expect(teamFormFactor([r(1, 0), r(2, 0), r(3, 0)]).multiplier).toBeCloseTo(0.92, 6);
  });
  it("lost, lost, then won the newest: weights 0.7225, 0.85, 1 -> index 1 / 2.5725 - 0.5 = -0.1113 -> x0.9822", () => {
    const f = teamFormFactor([r(1, 0), r(2, 0), r(3, 1)]);
    expect(f.index).toBeCloseTo(-0.1113, 3);
    expect(f.multiplier).toBeCloseTo(0.9822, 3);
  });
  it("input order does not matter", () => {
    expect(teamFormFactor([r(3, 1), r(1, 0), r(2, 0)]).multiplier).toBeCloseTo(0.9822, 3);
  });
  it("teamResultsFor reads wins, losses and ties for one team", () => {
    const results = [
      { matchId: 1, date: "a", teams: [1, 2] as [number, number], winnerTeamId: 1 },
      { matchId: 2, date: "b", teams: [1, 3] as [number, number], winnerTeamId: 3 },
      { matchId: 3, date: "c", teams: [1, 4] as [number, number], winnerTeamId: null },
      { matchId: 4, date: "d", teams: [2, 3] as [number, number], winnerTeamId: 2 },
    ];
    expect(teamResultsFor(results, 1).map((x) => x.won)).toEqual([1, 0, 0.5]);
  });
});

// ---------- death bowler ----------
const bowlRow = (date: string, pp: number, mid: number, death: number, deathRuns = 0, deathWkts = 0): HistoryRow => ({
  playerId: 1, matchId: Number(date.replace(/-/g, "")), date, leagueTier: "international", teamId: 1, venueId: 1,
  stats: { inPlayingXI: true, bowling: [{ balls: pp + mid + death, runsConceded: 0, wickets: 0, bowledOrLbw: 0, maidens: 0 }] },
  phases: {
    bat: { powerplay: { balls: 0, runs: 0, dismissals: 0 }, middle: { balls: 0, runs: 0, dismissals: 0 }, death: { balls: 0, runs: 0, dismissals: 0 } },
    bowl: {
      powerplay: { balls: pp, runs: 0, wickets: 0 },
      middle: { balls: mid, runs: 0, wickets: 0 },
      death: { balls: death, runs: deathRuns, wickets: deathWkts },
    },
  },
});

describe("deathBaseline", () => {
  it("24 death balls, 30 runs, 2 wickets -> economy 7.5, 0.5 wickets per over, 12 balls per wicket", () => {
    const b = deathBaseline([bowlRow("2026-01-01", 0, 0, 12, 18, 1), bowlRow("2026-01-02", 0, 0, 12, 12, 1)]);
    expect(b).toEqual({ economy: 7.5, wicketsPerOver: 0.5, ballsPerWicket: 12 });
  });
  it("no death data: null", () => {
    expect(deathBaseline([bowlRow("2026-01-01", 6, 6, 0)])).toBeNull();
  });
});

describe("deathProfile", () => {
  const baseline = { economy: 9, wicketsPerOver: 0.4, ballsPerWicket: 15 };

  it("pure death bowler: 5 matches of 4 death overs each, 30 runs and 2 wickets per match", () => {
    // 120 death balls, all of his overs at the death -> profile D. 120 is above the 90 "thin" line, below 180: low confidence.
    // economy 150 x 6 / 120 = 7.5 -> (9 - 7.5) / 9 = 0.1667; wickets 10 / 20 overs = 0.5 -> (0.5 - 0.4) / 0.4 = 0.25;
    // balls per wicket 12 -> (15 - 12) / 15 = 0.2;  score = 0.4 x 0.1667 + 0.4 x 0.25 + 0.2 x 0.2 = 0.2067
    const rows = ["01", "02", "03", "04", "05"].map((d) => bowlRow(`2026-01-${d}`, 0, 0, 24, 30, 2));
    const p = deathProfile(rows, baseline);
    expect(p).toMatchObject({ eligible: true, profile: "D", lowConfidence: true, deathBalls: 120, deathWickets: 10, deathShare: 1 });
    expect(p.score).toBeCloseTo(0.2067, 3);
    expect(p.deathEconomy).toBe(7.5);
  });

  it("180 death balls is a confident sample", () => {
    const rows = Array.from({ length: 8 }, (_, i) => bowlRow(`2026-01-${String(i + 1).padStart(2, "0")}`, 0, 0, 24, 30, 2));
    expect(deathProfile(rows, baseline)).toMatchObject({ eligible: true, lowConfidence: false });
  });

  it("new ball plus death: 1 powerplay over and 1 death over every time, but death is only a third of his overs", () => {
    const rows = Array.from({ length: 20 }, (_, i) => bowlRow(`2026-01-${String(i + 1).padStart(2, "0")}`, 6, 6, 6, 9, 0));
    const p = deathProfile(rows, baseline);
    expect(p.profile).toBe("N+D");
    expect(p.deathShare).toBeCloseTo(1 / 3, 6);
    expect(p.eligible).toBe(true);
  });

  it("an ordinary middle-overs bowler is not a death specialist", () => {
    const rows = Array.from({ length: 10 }, (_, i) => bowlRow(`2026-01-${String(i + 1).padStart(2, "0")}`, 0, 24, 0));
    expect(deathProfile(rows, baseline)).toMatchObject({ eligible: false, profile: null });
  });

  it("too few death overs: not eligible even if all his overs are at the death", () => {
    const p = deathProfile([bowlRow("2026-01-01", 0, 0, 24, 30, 2)], baseline);
    expect(p).toMatchObject({ profile: "D", eligible: false });
  });
});
