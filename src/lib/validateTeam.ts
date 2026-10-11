import {
  DEFAULT_RULES_PROFILE,
  FEATURE_FLAGS,
  RULES_PROFILES,
  ROLES,
  type FeatureFlags,
  type Role,
  type RulesProfile,
  type RulesProfileId,
} from "@/config/rules";
import type { Player, Team } from "./types";

export type ViolationCode =
  | "DUPLICATE_PLAYER"
  | "TEAM_SIZE"
  | "CREDITS_OVER_CAP"
  | "TEAM_CAP"
  | "ROLE_MIN"
  | "ROLE_MAX"
  | "CAPTAIN_MISSING"
  | "VICE_CAPTAIN_MISSING"
  | "CAPTAIN_EQUALS_VICE_CAPTAIN"
  | "CAPTAIN_NOT_IN_TEAM"
  | "VICE_CAPTAIN_NOT_IN_TEAM"
  | "BACKUPS_DISABLED"
  | "OUT_PLAYER_NOT_IN_TEAM";

export interface Violation {
  code: ViolationCode;
  message: string; // plain English, safe to show to the user
  role?: Role;
  team?: string;
}

export interface ValidationResult {
  valid: boolean;
  profile: RulesProfileId; // which rule set this team was checked against
  violations: Violation[];
}

export interface SwapValidationResult extends ValidationResult {
  warnings: string[];
}

const ROLE_LABEL: Record<Role, string> = {
  WK: "wicket-keepers",
  BAT: "batters",
  AR: "all-rounders",
  BOWL: "bowlers",
};

const defaultRules = () => RULES_PROFILES[DEFAULT_RULES_PROFILE];

// Checks the rules that depend only on who is in the 11 (not on captain choices).
function checkPlayers(players: Player[], rules: RulesProfile): Violation[] {
  const violations: Violation[] = [];

  // Count each player once, and report anyone picked more than once.
  const seen = new Set<string>();
  const reported = new Set<string>();
  const unique: Player[] = [];
  for (const p of players) {
    if (seen.has(p.id)) {
      if (!reported.has(p.id)) {
        reported.add(p.id);
        violations.push({
          code: "DUPLICATE_PLAYER",
          message: `${p.name} is selected more than once.`,
        });
      }
    } else {
      seen.add(p.id);
      unique.push(p);
    }
  }

  const size = rules.teamSize.value;
  if (unique.length !== size) {
    violations.push({
      code: "TEAM_SIZE",
      message: `The team has ${unique.length} different players but exactly ${size} are required.`,
    });
  }

  // Round to one decimal so adding 9.5 + 8.5 style credits cannot drift past 100 by accident.
  const totalCredits = Math.round(unique.reduce((sum, p) => sum + p.credits, 0) * 10) / 10;
  const cap = rules.creditCap.value;
  if (totalCredits > cap) {
    violations.push({
      code: "CREDITS_OVER_CAP",
      message: `Total credits are ${totalCredits} but the cap is ${cap}.`,
    });
  }

  const perTeam = new Map<string, number>();
  for (const p of unique) perTeam.set(p.team, (perTeam.get(p.team) ?? 0) + 1);
  const maxPerTeam = rules.maxPerTeam.value;
  for (const [team, n] of perTeam) {
    if (n > maxPerTeam) {
      violations.push({
        code: "TEAM_CAP",
        team,
        message: `${n} players are from ${team} but at most ${maxPerTeam} are allowed from one team.`,
      });
    }
  }

  for (const role of ROLES) {
    const n = unique.filter((p) => p.role === role).length;
    const { min, max } = rules.roleLimits[role];
    if (n < min.value) {
      violations.push({
        code: "ROLE_MIN",
        role,
        message: `Only ${n} ${ROLE_LABEL[role]} picked but at least ${min.value} are required.`,
      });
    }
    if (n > max.value) {
      violations.push({
        code: "ROLE_MAX",
        role,
        message: `${n} ${ROLE_LABEL[role]} picked but at most ${max.value} are allowed.`,
      });
    }
  }

  return violations;
}

// Returns EVERY broken rule, not just the first, and states which rule profile was used.
export function validateTeam(team: Team, rules: RulesProfile = defaultRules()): ValidationResult {
  const violations = checkPlayers(team.players, rules);
  const ids = new Set(team.players.map((p) => p.id));

  if (!team.captainId) {
    violations.push({ code: "CAPTAIN_MISSING", message: "No captain has been chosen." });
  } else if (!ids.has(team.captainId)) {
    violations.push({
      code: "CAPTAIN_NOT_IN_TEAM",
      message: "The captain is not one of the 11 selected players.",
    });
  }

  if (!team.viceCaptainId) {
    violations.push({ code: "VICE_CAPTAIN_MISSING", message: "No vice-captain has been chosen." });
  } else if (!ids.has(team.viceCaptainId)) {
    violations.push({
      code: "VICE_CAPTAIN_NOT_IN_TEAM",
      message: "The vice-captain is not one of the 11 selected players.",
    });
  }

  if (
    rules.captainMustDifferFromViceCaptain.value &&
    team.captainId &&
    team.captainId === team.viceCaptainId
  ) {
    violations.push({
      code: "CAPTAIN_EQUALS_VICE_CAPTAIN",
      message: "The captain and vice-captain must be two different players.",
    });
  }

  return { valid: violations.length === 0, profile: rules.id, violations };
}

// Checks whether swapping one starter for a backup still leaves a valid team.
// Backups are a suggestion only, switched off by a feature flag until the rule is verified.
export function validateBackupSwap(
  team: Team,
  outPlayerId: string,
  backup: Player,
  rules: RulesProfile = defaultRules(),
  features: FeatureFlags = FEATURE_FLAGS,
): SwapValidationResult {
  const result = (violations: Violation[], warnings: string[] = []): SwapValidationResult => ({
    valid: violations.length === 0,
    profile: rules.id,
    violations,
    warnings,
  });

  if (!features.backups.enabled.value) {
    return result([
      {
        code: "BACKUPS_DISABLED",
        message: "Backups are switched off because the backup rule has not been verified.",
      },
    ]);
  }

  const out = team.players.find((p) => p.id === outPlayerId);
  if (!out) {
    return result([
      {
        code: "OUT_PLAYER_NOT_IN_TEAM",
        message: "The player to be swapped out is not in the team.",
      },
    ]);
  }

  const swapped = team.players.filter((p) => p.id !== outPlayerId).concat(backup);
  const warnings: string[] = [];
  if (outPlayerId === team.captainId || outPlayerId === team.viceCaptainId) {
    warnings.push(
      `${out.name} is the captain or vice-captain. How Dream11 handles that in a swap is unverified, so choose a new captain or vice-captain yourself.`,
    );
  }

  return result(checkPlayers(swapped, rules), warnings);
}
