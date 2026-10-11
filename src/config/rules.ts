import { sourced, type Sourced } from "./sourced";

// Team rules as plain data. Logic in src/lib reads these; it never contains the numbers.
// Source for all values: docs/RULES_LOCKED.md section A.

export type Role = "WK" | "BAT" | "AR" | "BOWL";
export const ROLES: Role[] = ["WK", "BAT", "AR", "BOWL"];

export type RulesProfileId = "strict" | "loose";

export interface RoleLimit {
  min: Sourced<number>;
  max: Sourced<number>;
}

export interface RulesProfile {
  id: RulesProfileId;
  description: string;
  teamSize: Sourced<number>;
  creditCap: Sourced<number>;
  maxPerTeam: Sourced<number>;
  roleLimits: Record<Role, RoleLimit>;
  captainMultiplier: Sourced<number>;
  viceCaptainMultiplier: Sourced<number>;
  captainMustDifferFromViceCaptain: Sourced<boolean>;
}

const LOCKED = "docs/RULES_LOCKED.md section A";
const CONFLICT_TEAM = `${LOCKED}: sources disagree (7 vs 10 per team)`;
const CONFLICT_ROLES = `${LOCKED}: sources disagree (strict limits vs 1-8 per role)`;

function limit(min: number, max: number, source: string): RoleLimit {
  return {
    min: sourced(min, "conflict", source),
    max: sourced(max, "conflict", source),
  };
}

// Values every profile shares because all sources agree.
const shared = {
  teamSize: sourced(11, "certain", `${LOCKED}: all sources agree`),
  creditCap: sourced(100, "certain", `${LOCKED}: all sources agree`),
  captainMultiplier: sourced(2, "certain", `${LOCKED}: Dream11 page`),
  viceCaptainMultiplier: sourced(1.5, "certain", `${LOCKED}: Dream11 page`),
  captainMustDifferFromViceCaptain: sourced(true, "certain", `${LOCKED}: basic rule`),
};

export const RULES_PROFILES: Record<RulesProfileId, RulesProfile> = {
  // Default. A team that obeys these also obeys the loose profile, so it is valid under either real rule set.
  strict: {
    id: "strict",
    description: "Safe default: max 7 per team, WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6.",
    ...shared,
    maxPerTeam: sourced(7, "conflict", CONFLICT_TEAM),
    roleLimits: {
      WK: limit(1, 4, CONFLICT_ROLES),
      BAT: limit(3, 6, CONFLICT_ROLES),
      AR: limit(1, 4, CONFLICT_ROLES),
      BOWL: limit(3, 6, CONFLICT_ROLES),
    },
  },
  loose: {
    id: "loose",
    description: "Alternative reading: max 10 per team, 1-8 per role.",
    ...shared,
    maxPerTeam: sourced(10, "conflict", CONFLICT_TEAM),
    roleLimits: {
      WK: limit(1, 8, CONFLICT_ROLES),
      BAT: limit(1, 8, CONFLICT_ROLES),
      AR: limit(1, 8, CONFLICT_ROLES),
      BOWL: limit(1, 8, CONFLICT_ROLES),
    },
  },
};

export const DEFAULT_RULES_PROFILE: RulesProfileId = "strict";

// Features that are switched off until their rule is verified.
export const FEATURE_FLAGS = {
  backups: {
    enabled: sourced(false, "unverified", `${LOCKED}: backup rule not found in any source`),
    maxBackups: sourced(4, "unverified", `${LOCKED}: backup rule not found in any source`),
  },
};

export type FeatureFlags = typeof FEATURE_FLAGS;
