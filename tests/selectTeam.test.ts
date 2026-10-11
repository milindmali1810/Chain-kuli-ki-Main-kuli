import { describe, it, expect } from "vitest";
import { RULES_PROFILES, type Role } from "@/config/rules";
import { applyDeathRule, chooseCaptains, selectTeam, type Candidate } from "@/lib/selectTeam";
import { validateTeam } from "@/lib/validateTeam";

const strict = RULES_PROFILES.strict;
const loose = RULES_PROFILES.loose;

function cand(id: number, role: Role, team: string, credits: number, expected: number, extra: Partial<Candidate> = {}): Candidate {
  return {
    id, name: `P${id}`, team, role, credits, pPlay: 1, expectedIfPlays: expected, expected, blankRate: 0.2,
    avgBallsFaced: 20, avgOvers: 4, ...extra,
  };
}

// Deterministic pseudo-random pool so the test is repeatable.
function pool(n: number, seed: number): Candidate[] {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const roles: Role[] = ["WK", "WK", "BAT", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL", "BAT", "BOWL"];
  return Array.from({ length: n }, (_, i) =>
    cand(i + 1, roles[i % roles.length], i % 2 === 0 ? "A" : "B", 8 + Math.round(rnd() * 6) / 2, 10 + Math.round(rnd() * 500) / 10),
  );
}

// Brute force: try every combination of 11, keep the best legal one. Slow but obviously right.
function bruteForce(players: Candidate[], rules = strict): number | null {
  let best: number | null = null;
  const n = players.length;
  const pick: Candidate[] = [];
  const go = (start: number) => {
    if (pick.length === 11) {
      const team = { players: pick.map((c) => ({ id: String(c.id), name: c.name, team: c.team, role: c.role, credits: c.credits })), captainId: String(pick[0].id), viceCaptainId: String(pick[1].id) };
      if (validateTeam(team, rules).valid) {
        const xs = pick.map((c) => c.expected).sort((a, b) => b - a);
        const score = xs.reduce((a, b) => a + b, 0) + xs[0] + 0.5 * xs[1];
        if (best === null || score > best) best = score;
      }
      return;
    }
    for (let i = start; i < n; i++) {
      pick.push(players[i]);
      go(i + 1);
      pick.pop();
    }
  };
  go(0);
  return best;
}

describe("selectTeam: exactly the best legal team", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`matches brute force on a random pool of 16 (seed ${seed})`, () => {
      const p = pool(16, seed);
      const expected = bruteForce(p);
      const result = selectTeam(p, strict);
      if (expected === null) expect(result).toBeNull();
      else expect(result!.score).toBeCloseTo(expected, 6);
    });
  }

  it("the chosen team passes the validator", () => {
    const p = pool(18, 7);
    const sel = selectTeam(p, strict)!;
    const team = {
      players: sel.players.map((c) => ({ id: String(c.id), name: c.name, team: c.team, role: c.role, credits: c.credits })),
      captainId: String(sel.players[0].id),
      viceCaptainId: String(sel.players[1].id),
    };
    expect(validateTeam(team, strict)).toMatchObject({ valid: true });
    expect(sel.players).toHaveLength(11);
    expect(sel.totalCredits).toBeLessThanOrEqual(100);
  });

  it("the credit cap changes the answer: the same pool with an expensive star", () => {
    // 11 near-identical players, plus one star at 11 credits worth far more. Without the cap he is in;
    // with every other player at 9.5 the cap (100) forces a cheaper player out: 10 x 9.5 + 11 = 106 > 100.
    const base = [
      cand(1, "WK", "A", 9.5, 30), cand(2, "BAT", "A", 9.5, 30), cand(3, "BAT", "A", 9.5, 30), cand(4, "BAT", "B", 9.5, 30),
      cand(5, "AR", "B", 9.5, 30), cand(6, "AR", "B", 9.5, 30), cand(7, "BOWL", "A", 9.5, 30), cand(8, "BOWL", "B", 9.5, 30),
      cand(9, "BOWL", "B", 9.5, 30), cand(10, "BOWL", "A", 9.5, 30), cand(11, "BAT", "B", 9.5, 30), cand(12, "BOWL", "A", 7, 5),
      cand(13, "BAT", "B", 7, 5),
    ];
    const star = cand(99, "BAT", "A", 11, 80);
    const sel = selectTeam([...base, star], strict)!;
    expect(sel.totalCredits).toBeLessThanOrEqual(100);
    // 11 x 9.5 = 104.5 is over the cap already, so the engine must mix in the cheap players.
    expect(sel.players.some((c) => c.credits === 7)).toBe(true);
  });

  it("returns null when no legal team exists (everyone from one side)", () => {
    const p = Array.from({ length: 12 }, (_, i) => cand(i + 1, (["WK", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BAT", "BOWL"] as Role[])[i], "A", 8, 20));
    expect(selectTeam(p, strict)).toBeNull(); // 7 per team max, only one team
  });

  it("the loose profile can pick a team the strict profile cannot", () => {
    // 10 from one side is legal under loose (max 10) but not strict (max 7).
    const p = [
      ...Array.from({ length: 10 }, (_, i) => cand(i + 1, (["WK", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL"] as Role[])[i], "A", 8, 30)),
      cand(11, "BAT", "B", 8, 5),
    ];
    expect(selectTeam(p, strict)).toBeNull();
    expect(selectTeam(p, loose)).not.toBeNull();
  });

  it("forced players are always in, and a forced player who breaks a rule gives null", () => {
    const p = pool(18, 3);
    const weakest = [...p].sort((a, b) => a.expected - b.expected)[0];
    const sel = selectTeam(p, strict, { forcedIds: [weakest.id] })!;
    expect(sel.players.map((c) => c.id)).toContain(weakest.id);
    const tooExpensive = cand(500, "BAT", "A", 101, 99);
    expect(selectTeam([...p, tooExpensive], strict, { forcedIds: [500] })).toBeNull();
  });

  it("it prunes: far fewer nodes than all combinations", () => {
    const sel = selectTeam(pool(22, 11), strict)!;
    expect(sel.nodesVisited).toBeLessThan(705432); // C(22, 11)
  });
});

describe("applyDeathRule", () => {
  const p = [cand(1, "BOWL", "A", 9, 50), cand(2, "BOWL", "B", 9, 40), cand(3, "BAT", "A", 9, 30)];

  it("no specialist: rule not applied, and the log says why", () => {
    const r = applyDeathRule(p, []);
    expect(r).toMatchObject({ bonusId: null, forcedIds: [] });
    expect(r.log[0]).toContain("not applied");
  });

  it("the best specialist inside the top 14 gets the bonus and a guaranteed slot", () => {
    const r = applyDeathRule(p, [{ id: 2, score: 0.3 }, { id: 1, score: 0.1 }]);
    expect(r).toMatchObject({ bonusId: 2, forcedIds: [2] });
    expect(r.log[0]).toContain("rank 2 of 3");
  });

  it("a specialist ranked below the cut is dropped, with the reason logged", () => {
    const big = Array.from({ length: 20 }, (_, i) => cand(i + 1, "BAT", "A", 9, 100 - i));
    const r = applyDeathRule(big, [{ id: 20, score: 0.5 }]); // ranked 20th
    expect(r).toMatchObject({ bonusId: null, forcedIds: [] });
    expect(r.log[0]).toContain("dropped");
  });
});

describe("chooseCaptains", () => {
  const team = [
    cand(1, "BAT", "A", 9, 50, { avgBallsFaced: 25, blankRate: 0.1 }),
    cand(2, "BAT", "A", 9, 48, { avgBallsFaced: 25, blankRate: 0.5 }),
    cand(3, "BOWL", "B", 9, 46, { avgOvers: 4, blankRate: 0.1 }),
    cand(4, "BAT", "B", 9, 60, { avgBallsFaced: 5, blankRate: 0.1 }), // top expected but a late-order batter: not eligible
  ];

  it("captain = highest expected x floor among ELIGIBLE players: P1 (50 x 0.9 = 45) beats P2 (48 x 0.5 = 24) and P3 (46 x 0.9 = 41.4)", () => {
    const c = chooseCaptains(team);
    expect(c.captainId).toBe(1);
    expect(c.scores.find((s) => s.id === 1)!.captainScore).toBeCloseTo(45, 6);
    expect(c.scores.find((s) => s.id === 4)!.captainScore).toBeNull();
  });

  it("vice-captain prefers a different route to points: the bowler P3 (46 x 1.05 = 48.3) beats the batter P4 (60) only if P4 is out", () => {
    // P4 has the highest expected (60) but is a batter like the captain, so no bonus: vcScore 60. He wins on raw points.
    expect(chooseCaptains(team).viceCaptainId).toBe(4);
    // Without P4, the bowler P3 (46 x 1.05 = 48.3) beats the batter P2 (48).
    expect(chooseCaptains(team.filter((c) => c.id !== 4)).viceCaptainId).toBe(3);
  });

  it("a player who might not play is not eligible: pPlay 0.8 is below the 0.9 captain line", () => {
    const shaky = [cand(1, "BAT", "A", 9, 90, { pPlay: 0.8, avgBallsFaced: 25 }), ...team.slice(1)];
    expect(chooseCaptains(shaky).captainId).not.toBe(1);
  });

  it("no eligible captain: falls back to the highest expected and says so", () => {
    const none = team.map((c) => ({ ...c, avgBallsFaced: 1, avgOvers: 1 }));
    const c = chooseCaptains(none);
    expect(c.captainId).toBe(4);
    expect(c.notes[0]).toContain("fell back");
  });

  it("captain and vice-captain are never the same player", () => {
    const c = chooseCaptains(team);
    expect(c.captainId).not.toBe(c.viceCaptainId);
  });
});
