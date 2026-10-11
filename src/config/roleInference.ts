import { sourced, type Sourced } from "./sourced";

// How a player's role is guessed from what he actually did. Cricsheet has no roles.
// All numbers are starting guesses; manual_overrides always wins over this.

export interface RoleInferenceConfig {
  windowMonths: Sourced<number>; // only matches in this window before the as-of date are used
  minMatches: Sourced<number>; // fewer matches than this: no role (shown as unavailable)
  wkMinStumpings: Sourced<number>; // only keepers stump
  minBowlShare: Sourced<number>; // share of matches in which he bowled at least one over
  minAvgOvers: Sourced<number>; // average overs when he bowls; below this he is a part-timer
  arMinBatShare: Sourced<number>; // share of matches in which he batted
  arMinAvgBallsFaced: Sourced<number>; // average balls faced when he batted
}

const SRC = "starting guess; checked against known players in the ingestion run";

export const ROLE_INFERENCE: RoleInferenceConfig = {
  windowMonths: sourced(36, "guessing", SRC),
  minMatches: sourced(5, "guessing", SRC),
  wkMinStumpings: sourced(2, "guessing", SRC),
  minBowlShare: sourced(0.25, "guessing", SRC),
  minAvgOvers: sourced(2, "guessing", SRC),
  arMinBatShare: sourced(0.6, "guessing", SRC),
  arMinAvgBallsFaced: sourced(8, "guessing", SRC),
};
