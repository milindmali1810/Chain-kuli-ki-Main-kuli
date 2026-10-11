import { describe, it, expect } from "vitest";
import type { Role } from "@/config/rules";
import type { HistoryRow } from "@/lib/history";
import { predict, type PredictInput } from "@/lib/predict";
import { RUBRIC } from "@/config/rubric";

// A made-up league: two teams of 11 with a legal role mix, 8 past matches each, one match per month.
const ROLES: Role[] = ["WK", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL"];
const AS_OF = "2026-09-01";

function playerRows(playerId: number, teamId: number, role: Role, skill: number, extra = 0): HistoryRow[] {
  return Array.from({ length: 8 }, (_, m) => {
    const bowls = role === "BOWL" || role === "AR";
    const bats = role !== "BOWL";
    return {
      playerId, matchId: m + 1, date: `2026-0${m + 1}-10`, leagueTier: "international", teamId, venueId: 1,
      stats: {
        inPlayingXI: true,
        batting: bats ? [{ runs: skill + extra, balls: 15, fours: 2, sixes: 1, dismissed: true }] : [{ runs: 2, balls: 3, fours: 0, sixes: 0, dismissed: true }],
        bowling: bowls ? [{ balls: 24, runsConceded: 30, wickets: skill > 25 ? 2 : 1, bowledOrLbw: 0, maidens: 0 }] : [],
        fielding: [],
      },
    };
  });
}

function league(extra = 0) {
  const roles = new Map<number, Role>();
  const names = new Map<number, string>();
  const credits = new Map<number, number>();
  const rows: HistoryRow[] = [];
  const pool: PredictInput["pool"] = [];
  for (const [teamId, base] of [[1, 0], [2, 100]] as const) {
    ROLES.forEach((role, i) => {
      const id = base + i + 1;
      roles.set(id, role);
      names.set(id, `Player ${id}`);
      credits.set(id, 8.5 + (i % 3) * 0.5); // 8.5 to 9.5: an 11 sums to about 99
      rows.push(...playerRows(id, teamId, role, 10 + i * 3 + (base ? 5 : 0), extra));
      pool.push({ playerId: id, teamId, pPlay: 1 });
    });
  }
  const input: PredictInput = {
    stage: "final", asOfDate: AS_OF, rows, roles, names, teamNames: new Map([[1, "Team A"], [2, "Team B"]]),
    matchTeamIds: [1, 2], venueId: 1, pool, credits,
  };
  return input;
}

describe("predict: the whole pipeline", () => {
  it("builds a legal team: 11 players, valid, within 100 credits, with different captain and vice-captain", () => {
    const p = predict(league());
    expect(p.selected).toHaveLength(11);
    expect(p.validation).toMatchObject({ valid: true, profile: "strict" });
    expect(p.selection!.totalCredits).toBeLessThanOrEqual(100);
    expect(p.captains!.captainId).not.toBeNull();
    expect(p.captains!.captainId).not.toBe(p.captains!.viceCaptainId);
  });

  it("is deterministic: the same input gives the same team", () => {
    const a = predict(league());
    const b = predict(league());
    expect(a.selected.map((s) => s.candidate.id)).toEqual(b.selected.map((s) => s.candidate.id));
    expect(a.captains).toEqual(b.captains);
  });

  it("cannot peek: rows dated on or after the match date change nothing", () => {
    const clean = predict(league());
    const input = league();
    // A huge future performance by Player 11 (a bowler) that must be ignored.
    input.rows.push({
      playerId: 11, matchId: 99, date: AS_OF, leagueTier: "international", teamId: 1, venueId: 1,
      stats: { inPlayingXI: true, batting: [{ runs: 500, balls: 50, fours: 50, sixes: 50, dismissed: false }] },
    });
    input.rows.push({
      playerId: 11, matchId: 100, date: "2026-12-01", leagueTier: "international", teamId: 1, venueId: 1,
      stats: { inPlayingXI: true, batting: [{ runs: 500, balls: 50, fours: 50, sixes: 50, dismissed: false }] },
    });
    const withFuture = predict(input);
    expect(withFuture.selected.map((s) => s.candidate.id)).toEqual(clean.selected.map((s) => s.candidate.id));
    expect(withFuture.pool.map((s) => s.candidate.expected)).toEqual(clean.pool.map((s) => s.candidate.expected));
  });

  it("a learned role correction scales that role's expected points and is recorded: batters x0.8", () => {
    const base = predict(league());
    const input = league();
    input.cfg = { ...RUBRIC, calibration: { ...RUBRIC.calibration, BAT: { ...RUBRIC.calibration.BAT, value: 0.8 } } };
    const corrected = predict(input);
    const batter = (p: typeof base) => p.pool.find((x) => x.candidate.id === 3)!;
    const bowler = (p: typeof base) => p.pool.find((x) => x.candidate.id === 9)!;
    expect(batter(corrected).candidate.expected).toBeCloseTo(batter(base).candidate.expected * 0.8, 6);
    expect(batter(corrected).factors.calibration).toBe(0.8);
    expect(bowler(corrected).candidate.expected).toBeCloseTo(bowler(base).candidate.expected, 6); // other roles untouched
  });

  it("better recent performances raise expected points", () => {
    const low = predict(league(0)).pool.find((p) => p.candidate.id === 3)!.candidate.expected;
    const high = predict(league(20)).pool.find((p) => p.candidate.id === 3)!.candidate.expected;
    expect(high).toBeGreaterThan(low);
  });

  it("excludes a player with no credit, and says why", () => {
    const input = league();
    input.credits.delete(5);
    const p = predict(input);
    expect(p.excluded).toContainEqual({ playerId: 5, name: "Player 5", reason: "credits unavailable" });
    expect(p.selected.map((s) => s.candidate.id)).not.toContain(5);
  });

  it("excludes a player with no role (too little history), and says why", () => {
    const input = league();
    input.roles.delete(6);
    expect(predict(input).excluded).toContainEqual(expect.objectContaining({ playerId: 6, reason: expect.stringContaining("role unavailable") }));
  });

  it("a player who may not play is discounted: pPlay 0.5 halves his expected points", () => {
    const sure = predict(league()).pool.find((p) => p.candidate.id === 3)!.candidate.expected;
    const input = league();
    input.pool.find((p) => p.playerId === 3)!.pPlay = 0.5;
    const maybe = predict(input).pool.find((p) => p.candidate.id === 3)!.candidate.expected;
    expect(maybe).toBeCloseTo(sure / 2, 6);
  });

  it("provisional predictions are labelled as such", () => {
    const input = league();
    input.stage = "provisional";
    expect(predict(input).notes.join(" ")).toContain("PROVISIONAL");
  });

  it("records what the model could not use, instead of inventing it", () => {
    expect(predict(league()).unavailableFactors.length).toBeGreaterThan(0);
  });

  it("reports honestly when no legal team exists (one side only)", () => {
    const input = league();
    input.pool = input.pool.filter((p) => p.teamId === 1);
    const p = predict(input);
    expect(p.selection).toBeNull();
    expect(p.notes.join(" ")).toContain("No legal team");
  });

  it("every selected player carries his factor breakdown", () => {
    const p = predict(league());
    for (const s of p.selected) {
      expect(s.factors.matchesUsed).toBeGreaterThan(0);
      expect(s.factors.venueMultiplier).toBeGreaterThan(0);
      expect(s.factors.lastPoints.length).toBeGreaterThan(0);
    }
  });
});
