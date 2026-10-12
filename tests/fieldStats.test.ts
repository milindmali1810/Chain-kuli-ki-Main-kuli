import { describe, expect, it } from "vitest";
import { RULES_PROFILES, type Role } from "@/config/rules";
import { edgeOver, fieldStats } from "@/lib/fieldStats";
import type { Candidate } from "@/lib/selectTeam";

const rules = RULES_PROFILES.strict;

// Two teams of 11 with a legal mix of roles and credits that fit the cap.
function pool(): Candidate[] {
  const roles: Role[] = ["WK", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL"];
  return ["A", "B"].flatMap((team, t) =>
    roles.map((role, i): Candidate => ({
      id: t * 11 + i + 1, name: `P${t * 11 + i + 1}`, team, role, credits: 8 + (i % 3) * 0.5, pPlay: 1,
      expectedIfPlays: 30, expected: 30, blankRate: 0.2, avgBallsFaced: 20, avgOvers: 4,
    })),
  );
}

describe("fieldStats", () => {
  const p = pool();
  const actual = new Map(p.map((c) => [c.id, c.id <= 11 ? 60 : 20])); // team A players score 60, team B 20
  const actualOf = (id: number) => actual.get(id) ?? 0;

  it("averages the picked players and the whole field", () => {
    const s = fieldStats({ pickedIds: [1, 2, 3, 4], pool: p, actualOf, fieldPoints: [...actual.values()], rules });
    expect(s.pickedAvg).toBe(60);
    expect(s.fieldAvg).toBe(40);
    expect(s.n).toBe(22);
  });
  it("builds random legal teams and averages them, between the best and worst", () => {
    const s = fieldStats({ pickedIds: [1], pool: p, actualOf, fieldPoints: [...actual.values()], rules });
    expect(s.randomLegalAvg).not.toBeNull();
    expect(s.samples).toBe(20);
    expect(s.randomLegalAvg!).toBeGreaterThan(20);
    expect(s.randomLegalAvg!).toBeLessThan(60);
  });
  it("is repeatable for the same match", () => {
    const a = fieldStats({ pickedIds: [1], pool: p, actualOf, fieldPoints: [], rules });
    const b = fieldStats({ pickedIds: [1], pool: p, actualOf, fieldPoints: [], rules });
    expect(a.randomLegalAvg).toBe(b.randomLegalAvg);
  });
  it("has no random baseline when no legal team exists", () => {
    const s = fieldStats({ pickedIds: [], pool: p.slice(0, 5), actualOf, fieldPoints: [], rules });
    expect(s.randomLegalAvg).toBeNull();
  });
});

describe("edgeOver", () => {
  it("is picked minus the chosen baseline, skipping missing baselines", () => {
    const stats = [{ pickedAvg: 40, fieldAvg: 38, randomLegalAvg: 36 }, { pickedAvg: 30, fieldAvg: 32, randomLegalAvg: null }];
    expect(edgeOver(stats, "field")).toEqual([2, -2]);
    expect(edgeOver(stats, "random")).toEqual([4]);
  });
});
