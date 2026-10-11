import { sourced, type Sourced } from "./sourced";

// Rubric parameters as data. Source: docs/RUBRIC.md (starting hypotheses, all tagged "guessing").
// The learning loop (M6) proposes versioned changes to these; nothing here is hardcoded in logic.

const g = (value: number, note: string): Sourced<number> => sourced(value, "guessing", `docs/RUBRIC.md ${note}`);

export interface RubricConfig {
  id: string;
  form: {
    recentMatches: Sourced<number>; // N_RECENT
    longMatches: Sourced<number>;
    recentWeight: Sourced<number>; // RECENT_W
    shrinkK: Sourced<number>; // matches of "prior" mixed in when history is thin
    tierWeight: Record<"international" | "franchise" | "domestic", Sourced<number>>;
  };
  venue: {
    minMatches: Sourced<number>; // VENUE_MIN
    batEnvHi: Sourced<number>; // BAT_ENV_HI: +-8% against competition average
    adj: Sourced<number>; // size of the pitch adjustment
    lowConfidenceFactor: Sourced<number>; // adjustment is halved on thin venue history
  };
  teamForm: {
    matches: Sourced<number>;
    decay: Sourced<number>;
    cap: Sourced<number>; // TEAMFORM_CAP
    minMatches: Sourced<number>;
  };
  death: {
    windowMonths: Sourced<number>;
    lastMatches: Sourced<number>;
    minBalls: Sourced<number>; // DEATH_MIN_OVERS: 30 overs
    thinMinBalls: Sourced<number>; // 15 overs, flagged low-confidence
    shareD: Sourced<number>; // DEATH_SHARE: pure death specialist
    shareND: Sourced<number>; // new-ball-plus-death specialist, share of matches
    bonus: Sourced<number>; // DEATH_BONUS
    rankTop: Sourced<number>; // DEATH_RANK: must rank in the top 14 of the pool
    wEcon: Sourced<number>;
    wWickets: Sourced<number>;
    wSr: Sourced<number>;
  };
  availability: {
    lastXIs: Sourced<number>; // how many recent XIs predict the next one
    pPlayMin: Sourced<number>; // P_PLAY_MIN
    provisionalMin: Sourced<number>; // below this a player is not even a provisional pick
  };
  captain: {
    pPlayMin: Sourced<number>;
    vcPPlayMin: Sourced<number>;
    diversify: Sourced<number>; // DIVERSIFY
    lowPoints: Sourced<number>; // a match below this counts as a blank for the floor factor
    minAvgBallsBat: Sourced<number>; // stand-in for "top-4 batter": batting order is not in our data
    minAvgOversBowl: Sourced<number>; // stand-in for "locked 4-over quota"
    arMinBalls: Sourced<number>;
    arMinOvers: Sourced<number>;
  };
}

export const RUBRIC: RubricConfig = {
  id: "v1.0",
  form: {
    recentMatches: g(8, "section 3a N_RECENT"),
    longMatches: g(30, "v1 choice"),
    recentWeight: g(0.4, "section 3a RECENT_W"),
    shrinkK: g(10, "v1 choice, like K_BAT"),
    tierWeight: {
      international: g(1, "v1 choice"),
      franchise: g(0.85, "v1 choice"),
      domestic: g(0.6, "v1 choice"),
    },
  },
  venue: {
    minMatches: g(8, "section 4 VENUE_MIN"),
    batEnvHi: g(0.08, "section 4 BAT_ENV_HI"),
    adj: g(0.05, "section 4"),
    lowConfidenceFactor: g(0.5, "section 4: halved on thin sample"),
  },
  teamForm: {
    matches: g(8, "section 4"),
    decay: g(0.85, "section 4"),
    cap: g(0.08, "section 4 TEAMFORM_CAP"),
    minMatches: g(3, "v1 choice"),
  },
  death: {
    windowMonths: g(24, "section 6"),
    lastMatches: g(15, "section 6"),
    minBalls: g(180, "section 6 DEATH_MIN_OVERS = 30 overs"),
    thinMinBalls: g(90, "section 6: 15 overs, low confidence"),
    shareD: g(0.5, "section 6 DEATH_SHARE"),
    shareND: g(0.6, "section 6"),
    bonus: g(0.1, "section 6 DEATH_BONUS"),
    rankTop: g(14, "section 6 DEATH_RANK"),
    wEcon: g(0.4, "section 6 DEATH_SCORE"),
    wWickets: g(0.4, "section 6 DEATH_SCORE"),
    wSr: g(0.2, "section 6 DEATH_SCORE"),
  },
  availability: {
    lastXIs: g(5, "v1 choice"),
    pPlayMin: g(0.75, "section 2 P_PLAY_MIN"),
    provisionalMin: g(0.4, "v1 choice"),
  },
  captain: {
    pPlayMin: g(0.9, "section 9"),
    vcPPlayMin: g(0.85, "section 9"),
    diversify: g(0.05, "section 9 DIVERSIFY"),
    lowPoints: g(20, "v1 choice"),
    minAvgBallsBat: g(15, "v1 stand-in for top-4 batter"),
    minAvgOversBowl: g(3.5, "v1 stand-in for locked 4-over quota"),
    arMinBalls: g(12, "section 9 all-rounder rule, stand-in"),
    arMinOvers: g(3, "section 9"),
  },
};
