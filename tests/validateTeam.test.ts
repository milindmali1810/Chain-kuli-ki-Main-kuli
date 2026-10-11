import { describe, it, expect } from "vitest";
import { RULES_PROFILES } from "@/config/rules";
import type { Role } from "@/config/rules";
import { validateTeam } from "@/lib/validateTeam";
import { makePlayer, teamFromRoles, validTeam, VALID_ROLES } from "./helpers";

const strict = RULES_PROFILES.strict;
const loose = RULES_PROFILES.loose;

const codes = (team: Parameters<typeof validateTeam>[0], rules = strict) =>
  validateTeam(team, rules).violations.map((v) => v.code);

describe("validateTeam: a valid team", () => {
  it("passes with no violations and says which profile it used", () => {
    const result = validateTeam(validTeam(), strict);
    expect(result).toEqual({ valid: true, profile: "strict", violations: [] });
  });

  it("uses the strict profile when none is given", () => {
    expect(validateTeam(validTeam()).profile).toBe("strict");
  });

  it("allows exactly 100 credits (the cap is inclusive)", () => {
    const team = teamFromRoles(VALID_ROLES, { credits: [10, ...Array(10).fill(9)] });
    expect(codes(team)).toEqual([]);
  });
});

describe("validateTeam: one failing case per rule", () => {
  it("team size: 10 players", () => {
    const team = teamFromRoles(VALID_ROLES.slice(0, 10));
    const result = validateTeam(team, strict);
    expect(result.valid).toBe(false);
    expect(result.violations.map((v) => v.code)).toEqual(["TEAM_SIZE"]);
    expect(result.violations[0].message).toBe(
      "The team has 10 different players but exactly 11 are required.",
    );
  });

  it("team size: 12 players", () => {
    const team = teamFromRoles([...VALID_ROLES, "BOWL"]);
    expect(codes(team)).toContain("TEAM_SIZE");
  });

  it("credits over 100: 101", () => {
    const team = teamFromRoles(VALID_ROLES, { credits: [11, ...Array(10).fill(9)] });
    const result = validateTeam(team, strict);
    expect(result.violations.map((v) => v.code)).toEqual(["CREDITS_OVER_CAP"]);
    expect(result.violations[0].message).toBe("Total credits are 101 but the cap is 100.");
  });

  it("per-team cap: 8 players from one side (strict allows 7)", () => {
    const teams = [...Array(8).fill("Team A"), ...Array(3).fill("Team B")];
    const result = validateTeam(teamFromRoles(VALID_ROLES, { teams }), strict);
    expect(result.violations.map((v) => v.code)).toEqual(["TEAM_CAP"]);
    expect(result.violations[0].team).toBe("Team A");
    expect(result.violations[0].message).toBe(
      "8 players are from Team A but at most 7 are allowed from one team.",
    );
  });

  // Each case: a lineup that breaks exactly the named limit (other limits may break too; we check the named one).
  const roleCases: { name: string; roles: Role[]; code: "ROLE_MIN" | "ROLE_MAX"; role: Role }[] = [
    { name: "WK minimum (0 keepers)", roles: ["BAT", "BAT", "BAT", "BAT", "BAT", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"], code: "ROLE_MIN", role: "WK" },
    { name: "WK maximum (5 keepers)", roles: ["WK", "WK", "WK", "WK", "WK", "BAT", "BAT", "BAT", "AR", "BOWL", "BOWL"], code: "ROLE_MAX", role: "WK" },
    { name: "BAT minimum (2 batters)", roles: ["WK", "WK", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"], code: "ROLE_MIN", role: "BAT" },
    { name: "BAT maximum (7 batters)", roles: ["WK", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "AR", "BOWL", "BOWL"], code: "ROLE_MAX", role: "BAT" },
    { name: "AR minimum (0 all-rounders)", roles: ["WK", "BAT", "BAT", "BAT", "BAT", "BAT", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"], code: "ROLE_MIN", role: "AR" },
    { name: "AR maximum (5 all-rounders)", roles: ["WK", "BAT", "BAT", "BAT", "AR", "AR", "AR", "AR", "AR", "BOWL", "BOWL"], code: "ROLE_MAX", role: "AR" },
    { name: "BOWL minimum (2 bowlers)", roles: ["WK", "BAT", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "AR", "BOWL", "BOWL"], code: "ROLE_MIN", role: "BOWL" },
    { name: "BOWL maximum (7 bowlers)", roles: ["WK", "BAT", "BAT", "BAT", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"], code: "ROLE_MAX", role: "BOWL" },
  ];

  for (const c of roleCases) {
    it(`role limit: ${c.name}`, () => {
      expect(c.roles).toHaveLength(11);
      const result = validateTeam(teamFromRoles(c.roles), strict);
      expect(result.valid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ code: c.code, role: c.role }),
      );
    });
  }

  it("role message is plain English", () => {
    const roles: Role[] = ["WK", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "AR", "BOWL", "BOWL"];
    const messages = validateTeam(teamFromRoles(roles), strict).violations.map((v) => v.message);
    expect(messages).toContain("7 batters picked but at most 6 are allowed.");
  });

  it("missing captain", () => {
    const team = { ...validTeam(), captainId: undefined };
    expect(codes(team)).toEqual(["CAPTAIN_MISSING"]);
  });

  it("missing vice-captain", () => {
    const team = { ...validTeam(), viceCaptainId: undefined };
    expect(codes(team)).toEqual(["VICE_CAPTAIN_MISSING"]);
  });

  it("captain equals vice-captain", () => {
    const team = { ...validTeam(), viceCaptainId: "p1" };
    expect(codes(team)).toEqual(["CAPTAIN_EQUALS_VICE_CAPTAIN"]);
  });

  it("captain who is not in the team", () => {
    const team = { ...validTeam(), captainId: "p99" };
    expect(codes(team)).toEqual(["CAPTAIN_NOT_IN_TEAM"]);
  });

  it("vice-captain who is not in the team", () => {
    const team = { ...validTeam(), viceCaptainId: "p99" };
    expect(codes(team)).toEqual(["VICE_CAPTAIN_NOT_IN_TEAM"]);
  });

  it("duplicate player (also leaves the team one short)", () => {
    const team = validTeam();
    team.players[10] = makePlayer(1, "WK", "Team A"); // p1 twice, p11 gone
    const result = validateTeam(team, strict);
    expect(result.violations.map((v) => v.code)).toContain("DUPLICATE_PLAYER");
    expect(result.violations.map((v) => v.code)).toContain("TEAM_SIZE");
    expect(result.violations.find((v) => v.code === "DUPLICATE_PLAYER")?.message).toBe(
      "Player 1 is selected more than once.",
    );
  });
});

describe("validateTeam: reports every violation, not just the first", () => {
  it("returns all broken rules at once", () => {
    // 10 players, 8 from one side, 101+ credits, no captain, same person would not matter
    const team = teamFromRoles(VALID_ROLES.slice(0, 10), {
      teams: [...Array(8).fill("Team A"), "Team B", "Team B"],
      credits: Array(10).fill(10.5),
    });
    const found = codes({ ...team, captainId: undefined });
    expect(found).toEqual(expect.arrayContaining(["TEAM_SIZE", "CREDITS_OVER_CAP", "TEAM_CAP", "CAPTAIN_MISSING"]));
  });
});

describe("validateTeam: strict and loose behave differently where they should", () => {
  it("8 players from one side: strict fails, loose passes", () => {
    const teams = [...Array(8).fill("Team A"), ...Array(3).fill("Team B")];
    const team = teamFromRoles(VALID_ROLES, { teams });
    expect(validateTeam(team, strict).valid).toBe(false);
    expect(validateTeam(team, loose).valid).toBe(true);
  });

  it("11 players from one side: both fail (loose cap is 10)", () => {
    const team = teamFromRoles(VALID_ROLES, { teams: Array(11).fill("Team A") });
    expect(codes(team, strict)).toContain("TEAM_CAP");
    expect(codes(team, loose)).toContain("TEAM_CAP");
  });

  it("7 batters: strict fails (max 6), loose passes (max 8)", () => {
    const roles: Role[] = ["WK", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "BAT", "AR", "BOWL", "BOWL"];
    const team = teamFromRoles(roles);
    expect(codes(team, strict)).toContain("ROLE_MAX");
    expect(validateTeam(team, loose).valid).toBe(true);
  });

  it("2 batters: strict fails (min 3), loose passes (min 1)", () => {
    const roles: Role[] = ["WK", "WK", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"];
    const team = teamFromRoles(roles);
    expect(codes(team, strict)).toContain("ROLE_MIN");
    expect(validateTeam(team, loose).valid).toBe(true);
  });

  it("0 all-rounders: both fail (loose min is still 1)", () => {
    const roles: Role[] = ["WK", "BAT", "BAT", "BAT", "BAT", "BAT", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"];
    expect(codes(teamFromRoles(roles), loose)).toContain("ROLE_MIN");
  });

  it("each result names the profile it checked", () => {
    expect(validateTeam(validTeam(), loose).profile).toBe("loose");
  });
});
