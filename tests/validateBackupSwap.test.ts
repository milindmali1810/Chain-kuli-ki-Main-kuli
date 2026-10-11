import { describe, it, expect } from "vitest";
import { FEATURE_FLAGS, RULES_PROFILES } from "@/config/rules";
import { sourced } from "@/config/sourced";
import { validateBackupSwap } from "@/lib/validateTeam";
import { makePlayer, validTeam } from "./helpers";

const strict = RULES_PROFILES.strict;

// Same flags, backups switched on (the real default is off).
const backupsOn = {
  ...FEATURE_FLAGS,
  backups: { ...FEATURE_FLAGS.backups, enabled: sourced(true, "unverified", "test only") },
};

describe("validateBackupSwap", () => {
  it("is off by default: the feature flag blocks every swap", () => {
    const backup = makePlayer(12, "BAT", "Team B");
    const result = validateBackupSwap(validTeam(), "p3", backup, strict);
    expect(result.valid).toBe(false);
    expect(result.violations.map((v) => v.code)).toEqual(["BACKUPS_DISABLED"]);
  });

  it("allows a like-for-like swap when backups are on", () => {
    // p3 is a BAT from Team A; swap in a BAT from Team B (Team B 5 -> 6, still under 7)
    const backup = makePlayer(12, "BAT", "Team B");
    const result = validateBackupSwap(validTeam(), "p3", backup, strict, backupsOn);
    expect(result).toEqual({ valid: true, profile: "strict", violations: [], warnings: [] });
  });

  it("rejects a swap that breaks a role limit (the only keeper swapped for a batter)", () => {
    const backup = makePlayer(12, "BAT", "Team B");
    const result = validateBackupSwap(validTeam(), "p1", backup, strict, backupsOn);
    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(expect.objectContaining({ code: "ROLE_MIN", role: "WK" }));
  });

  it("rejects a swap that pushes credits over the cap", () => {
    const backup = makePlayer(12, "BAT", "Team B", 12); // replaces a 9 -> total 102
    const result = validateBackupSwap(validTeam(), "p3", backup, strict, backupsOn);
    expect(result.violations.map((v) => v.code)).toEqual(["CREDITS_OVER_CAP"]);
  });

  it("rejects a swap that breaks the per-team cap", () => {
    // Make Team A 7 players, then swap a Team B batter for another Team A batter -> 8
    const team = validTeam();
    team.players[6] = { ...team.players[6], team: "Team A" }; // Team A now 7
    const backup = makePlayer(12, "BOWL", "Team A");
    const result = validateBackupSwap(team, "p8", backup, strict, backupsOn);
    expect(result.violations).toContainEqual(expect.objectContaining({ code: "TEAM_CAP", team: "Team A" }));
  });

  it("rejects a backup who is already in the team", () => {
    const result = validateBackupSwap(validTeam(), "p3", validTeam().players[4], strict, backupsOn);
    expect(result.violations.map((v) => v.code)).toContain("DUPLICATE_PLAYER");
  });

  it("rejects swapping out someone who is not in the team", () => {
    const backup = makePlayer(12, "BAT", "Team B");
    const result = validateBackupSwap(validTeam(), "p99", backup, strict, backupsOn);
    expect(result.violations.map((v) => v.code)).toEqual(["OUT_PLAYER_NOT_IN_TEAM"]);
  });

  it("warns, without failing, when the swapped-out player is the captain", () => {
    const backup = makePlayer(12, "WK", "Team B");
    const result = validateBackupSwap(validTeam(), "p1", backup, strict, backupsOn);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("unverified");
  });
});
