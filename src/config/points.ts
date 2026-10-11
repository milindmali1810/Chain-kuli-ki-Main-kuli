import { sourced, type Sourced } from "./sourced";
import type { Role } from "./rules";

// T20 fantasy points table as plain data. scorePlayerMatch reads it; it never contains the numbers.
// Source for all values: docs/RULES_LOCKED.md section B.

export type PointsProfileId = "standard" | "variant";

// A numeric range. Any combination of the four bounds; a value must satisfy all that are present.
export interface Range {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

export interface Bracket {
  range: Range;
  points: Sourced<number>;
}

// Milestones never stack: only the highest threshold reached is paid.
export interface Milestone {
  threshold: number;
  bonus: Sourced<number>;
}

export interface PointsProfile {
  id: PointsProfileId;
  description: string;
  excludeSuperOver: Sourced<boolean>;
  playingXI: Sourced<number>;
  batting: {
    run: Sourced<number>;
    four: Sourced<number>; // bonus on top of the run points
    six: Sourced<number>; // bonus on top of the run points
    milestones: Milestone[];
    duck: Sourced<number>;
    duckRoles: Role[];
    strikeRate: {
      minBalls: Sourced<number>;
      exemptRoles: Role[];
      bonus: Bracket[];
      penalty: Bracket[];
    };
  };
  bowling: {
    wicket: Sourced<number>; // not run outs
    bowledOrLbwBonus: Sourced<number>;
    milestones: Milestone[];
    maiden: Sourced<number>;
    economy: {
      minOvers: Sourced<number>;
      brackets: Bracket[];
    };
  };
  fielding: {
    catch: Sourced<number>;
    catchBonus: Milestone;
    stumping: Sourced<number>;
    runOutDirect: Sourced<number>;
    runOutShared: Sourced<number>; // each fielder involved
  };
}

const LOCKED = "docs/RULES_LOCKED.md section B";
const GEMINI_ONLY = `${LOCKED}: only in the Gemini-generated rulebook`;
// Second, independent source (third-party, last modified May 2021). Lists the same T20 table.
const SPORTSKEEDA = `${LOCKED}: Gemini rulebook, and Sportskeeda T20 points page (May 2021) agrees`;

const standard: PointsProfile = {
  id: "standard",
  description: "Default: four bonus +1, six bonus +2, milestones 30/50/100.",
  excludeSuperOver: sourced(true, "certain", "docs/RULES_LOCKED.md section A: Dream11 page"),
  playingXI: sourced(4, "likely", `${LOCKED}: Sportskeeda T20 points page (May 2021) says +4; an older source says +2`),
  batting: {
    run: sourced(1, "likely", LOCKED),
    four: sourced(1, "likely", LOCKED),
    six: sourced(2, "likely", LOCKED),
    milestones: [
      { threshold: 30, bonus: sourced(4, "likely", GEMINI_ONLY) },
      { threshold: 50, bonus: sourced(8, "likely", LOCKED) },
      { threshold: 100, bonus: sourced(16, "likely", LOCKED) },
    ],
    duck: sourced(-2, "certain", LOCKED),
    duckRoles: ["BAT", "WK", "AR"],
    strikeRate: {
      minBalls: sourced(10, "likely", LOCKED),
      exemptRoles: ["BOWL"],
      bonus: [
        { range: { gt: 170 }, points: sourced(6, "likely", LOCKED) },
        { range: { gt: 150, lte: 170 }, points: sourced(4, "likely", LOCKED) },
        { range: { gte: 130, lte: 150 }, points: sourced(2, "likely", LOCKED) },
      ],
      penalty: [
        { range: { gte: 60, lte: 70 }, points: sourced(-2, "likely", SPORTSKEEDA) },
        // Sportskeeda prints this bracket as "50 to 50.99", which looks like a typo for 50 to 59.99.
        { range: { gte: 50, lt: 60 }, points: sourced(-4, "guessing", `${SPORTSKEEDA}; its bracket text looks like a typo`) },
        { range: { lt: 50 }, points: sourced(-6, "likely", SPORTSKEEDA) },
      ],
    },
  },
  bowling: {
    wicket: sourced(25, "likely", LOCKED),
    bowledOrLbwBonus: sourced(8, "likely", LOCKED),
    milestones: [
      { threshold: 3, bonus: sourced(4, "likely", LOCKED) },
      { threshold: 4, bonus: sourced(8, "likely", LOCKED) },
      { threshold: 5, bonus: sourced(16, "likely", LOCKED) },
    ],
    maiden: sourced(12, "likely", LOCKED),
    economy: {
      minOvers: sourced(2, "likely", LOCKED),
      brackets: [
        { range: { lt: 5 }, points: sourced(6, "likely", LOCKED) },
        { range: { gte: 5, lt: 6 }, points: sourced(4, "likely", LOCKED) },
        { range: { gte: 6, lte: 7 }, points: sourced(2, "likely", LOCKED) },
        { range: { gte: 10, lte: 11 }, points: sourced(-2, "likely", LOCKED) },
        { range: { gt: 11, lte: 12 }, points: sourced(-4, "likely", LOCKED) },
        { range: { gt: 12 }, points: sourced(-6, "likely", LOCKED) },
      ],
    },
  },
  fielding: {
    catch: sourced(8, "likely", LOCKED),
    catchBonus: { threshold: 3, bonus: sourced(4, "likely", LOCKED) },
    stumping: sourced(12, "likely", LOCKED),
    runOutDirect: sourced(12, "likely", LOCKED),
    runOutShared: sourced(6, "likely", LOCKED),
  },
};

const VARIANT_SOURCE = `${LOCKED}: alternate profile, unclear which contest type it applies to`;

const variant: PointsProfile = {
  ...standard,
  id: "variant",
  description: "Alternate: four bonus +4, six bonus +6, milestones 25/50/75/100. Stored, not default.",
  batting: {
    ...standard.batting,
    four: sourced(4, "guessing", VARIANT_SOURCE),
    six: sourced(6, "guessing", VARIANT_SOURCE),
    milestones: [
      { threshold: 25, bonus: sourced(4, "guessing", VARIANT_SOURCE) },
      // Not listed in the variant spec; copied from standard so there is no gap.
      { threshold: 50, bonus: sourced(8, "guessing", `${VARIANT_SOURCE}; 50-run value copied from standard`) },
      { threshold: 75, bonus: sourced(12, "guessing", VARIANT_SOURCE) },
      { threshold: 100, bonus: sourced(16, "guessing", VARIANT_SOURCE) },
    ],
  },
};

export const POINTS_PROFILES: Record<PointsProfileId, PointsProfile> = { standard, variant };

export const DEFAULT_POINTS_PROFILE: PointsProfileId = "standard";
