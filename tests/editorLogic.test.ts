import { describe, it, expect } from "vitest";
import { RULES_PROFILES, type Role } from "@/config/rules";
import { checkSelection, diffFromAgent, editMode, type EditorPlayer } from "@/lib/editorLogic";

// A made-up pool of 22 players: Team A ids 1-11, Team B ids 12-22, a legal role mix on each side, 9 credits each.
const ROLES: Role[] = ["WK", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL"];
const pool: EditorPlayer[] = [
  ...ROLES.map((role, i) => ({ id: i + 1, name: `A${i + 1}`, team: "Team A", role, credits: 9 })),
  ...ROLES.map((role, i) => ({ id: i + 12, name: `B${i + 1}`, team: "Team B", role, credits: 9 })),
];
// A valid XI: 6 from A (WK, 3 BAT, 1 AR, 1 BOWL... ) and 5 from B. Use: A1 WK, A2 A3 A4 BAT, A6 AR, A8 BOWL, B1 WK? keep roles legal:
const legal = [1, 2, 3, 4, 6, 8, 9, 12 + 1, 12 + 5, 12 + 7, 12 + 8]; // A1 WK, A2-4 BAT, A6 AR, A8-9 BOWL, B2 BAT, B6 AR, B8-9 BOWL

describe("editMode", () => {
  const start = "2026-10-12T14:00:00Z";
  it("open before the start time", () => {
    expect(editMode(new Date("2026-10-12T13:59:59Z"), start, false)).toBe("open");
  });
  it("locked from the start time on, when no result exists", () => {
    expect(editMode(new Date("2026-10-12T14:00:00Z"), start, false)).toBe("locked");
    expect(editMode(new Date("2026-10-12T18:00:00Z"), start, false)).toBe("locked");
  });
  it("a match that already has points is practice, so the demo works on played matches", () => {
    expect(editMode(new Date("2027-01-01T00:00:00Z"), start, true)).toBe("practice");
  });
});

describe("checkSelection: the same validator, live", () => {
  it("a legal XI with a captain and vice-captain is valid, and counts roles, teams and credits", () => {
    const c = checkSelection(pool, legal, 2, 3);
    expect(c.result.valid).toBe(true);
    expect(c.count).toBe(11);
    expect(c.credits).toBe(99);
    expect(c.roleCounts).toEqual({ WK: 1, BAT: 4, AR: 2, BOWL: 4 });
    expect(c.teamCounts).toEqual({ "Team A": 7, "Team B": 4 });
  });

  it("10 players: says the team is one short, in plain English", () => {
    const c = checkSelection(pool, legal.slice(0, 10), 2, 3);
    expect(c.result.valid).toBe(false);
    expect(c.result.violations.map((v) => v.message)).toContain("The team has 10 different players but exactly 11 are required.");
  });

  it("too many from one side breaks the per-team limit of the active rules (strict: 7)", () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14]; // 8 from Team A
    const c = checkSelection(pool, eight, 1, 2);
    expect(c.result.violations.map((v) => v.code)).toContain("TEAM_CAP");
    expect(checkSelection(pool, eight, 1, 2, RULES_PROFILES.loose).result.violations.map((v) => v.code)).not.toContain("TEAM_CAP");
  });

  it("swapping in a more expensive player can push credits over 100", () => {
    const rich = pool.map((p) => (p.id === 13 ? { ...p, credits: 20 } : p));
    const c = checkSelection(rich, legal, 2, 3);
    expect(c.credits).toBe(110);
    expect(c.result.violations.map((v) => v.code)).toContain("CREDITS_OVER_CAP");
  });

  it("no captain, or the same player twice, is reported", () => {
    expect(checkSelection(pool, legal, null, 3).result.violations.map((v) => v.code)).toContain("CAPTAIN_MISSING");
    expect(checkSelection(pool, legal, 2, 2).result.violations.map((v) => v.code)).toContain("CAPTAIN_EQUALS_VICE_CAPTAIN");
  });

  it("a captain who is not in the XI is reported", () => {
    expect(checkSelection(pool, legal, 5, 3).result.violations.map((v) => v.code)).toContain("CAPTAIN_NOT_IN_TEAM");
  });

  it("a player who is not in this match's pool cannot be smuggled in", () => {
    const c = checkSelection(pool, [...legal.slice(0, 10), 999], 2, 3);
    expect(c.result.valid).toBe(false);
    expect(c.result.violations.map((v) => v.message).join(" ")).toContain("not available for this match");
  });

  it("the checker and the agent's validator agree (same function), so a team valid here is valid there", () => {
    expect(checkSelection(pool, legal, 2, 3).result.profile).toBe("strict");
  });
});

describe("diffFromAgent: what Aryan changed", () => {
  const agent = { ids: legal, captainId: 2, viceId: 3 };

  it("nothing changed", () => {
    expect(diffFromAgent(pool, agent, { ids: [...legal], captainId: 2, viceId: 3 }).same).toBe(true);
  });

  it("a swap lists who went out and who came in, by name", () => {
    const mine = { ids: legal.map((id) => (id === 9 ? 10 : id)), captainId: 2, viceId: 3 };
    const d = diffFromAgent(pool, agent, mine);
    expect(d).toMatchObject({ removed: ["A9"], added: ["A10"], captainChanged: false, viceCaptainChanged: false, same: false });
  });

  it("captain and vice-captain changes are flagged separately", () => {
    const d = diffFromAgent(pool, agent, { ids: [...legal], captainId: 4, viceId: 3 });
    expect(d).toMatchObject({ captainChanged: true, viceCaptainChanged: false, same: false });
    expect(diffFromAgent(pool, agent, { ids: [...legal], captainId: 2, viceId: 4 }).viceCaptainChanged).toBe(true);
  });
});
