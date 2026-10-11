import { RUBRIC, type RubricConfig } from "@/config/rubric";
import type { HistoryRow } from "./history";

// RUBRIC section 6: find specialist death bowlers FROM THE DATA. No names are ever hardcoded.

export interface DeathBaseline {
  economy: number; // runs per over at the death, everyone
  wicketsPerOver: number;
  ballsPerWicket: number;
}

export interface DeathProfile {
  eligible: boolean;
  profile: "D" | "N+D" | null; // D = pure death specialist, N+D = new ball plus death
  score: number | null; // DEATH_SCORE: how much better than average at the death
  deathBalls: number;
  lowConfidence: boolean;
  deathEconomy: number | null;
  deathWickets: number;
  deathShare: number | null;
}

const phaseTotals = (r: HistoryRow) => {
  const b = r.phases?.bowl;
  return {
    pp: b?.powerplay.balls ?? 0,
    mid: b?.middle.balls ?? 0,
    death: b?.death.balls ?? 0,
    deathRuns: b?.death.runs ?? 0,
    deathWkts: b?.death.wickets ?? 0,
  };
};

export function deathBaseline(rows: HistoryRow[]): DeathBaseline | null {
  let balls = 0;
  let runs = 0;
  let wickets = 0;
  for (const r of rows) {
    const t = phaseTotals(r);
    balls += t.death;
    runs += t.deathRuns;
    wickets += t.deathWkts;
  }
  if (balls === 0 || wickets === 0) return null;
  return { economy: (runs * 6) / balls, wicketsPerOver: wickets / (balls / 6), ballsPerWicket: balls / wickets };
}

// `rows` are ONE bowler's rows inside the window (e.g. 24 months before the match).
export function deathProfile(rows: HistoryRow[], baseline: DeathBaseline, cfg: RubricConfig = RUBRIC): DeathProfile {
  const c = cfg.death;
  const all = rows.map(phaseTotals);
  const deathBalls = all.reduce((a, t) => a + t.death, 0);
  const deathRuns = all.reduce((a, t) => a + t.deathRuns, 0);
  const deathWickets = all.reduce((a, t) => a + t.deathWkts, 0);

  // Share of overs bowled at the death over his last N bowling matches.
  const lastBowling = rows
    .filter((r) => (r.stats.bowling ?? []).some((s) => !s.superOver && s.balls > 0))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-c.lastMatches.value)
    .map(phaseTotals);
  const lastTotal = lastBowling.reduce((a, t) => a + t.pp + t.mid + t.death, 0);
  const deathShare = lastTotal === 0 ? null : lastBowling.reduce((a, t) => a + t.death, 0) / lastTotal;
  const ndShare =
    lastBowling.length === 0 ? 0 : lastBowling.filter((t) => t.pp >= 6 && t.death >= 6).length / lastBowling.length;

  const profile: DeathProfile["profile"] =
    deathShare !== null && deathShare >= c.shareD.value ? "D" : ndShare >= c.shareND.value && lastBowling.length > 0 ? "N+D" : null;

  const enoughData = deathBalls >= c.thinMinBalls.value;
  const lowConfidence = enoughData && deathBalls < c.minBalls.value;
  const eligible = profile !== null && enoughData;

  let score: number | null = null;
  let deathEconomy: number | null = null;
  if (deathBalls > 0) {
    deathEconomy = (deathRuns * 6) / deathBalls;
    const econEdge = (baseline.economy - deathEconomy) / baseline.economy;
    const wicketsEdge = (deathWickets / (deathBalls / 6) - baseline.wicketsPerOver) / baseline.wicketsPerOver;
    const bpw = deathBalls / Math.max(deathWickets, 0.5);
    const srEdge = (baseline.ballsPerWicket - bpw) / baseline.ballsPerWicket;
    score = c.wEcon.value * econEdge + c.wWickets.value * wicketsEdge + c.wSr.value * srEdge;
  }

  return { eligible, profile, score, deathBalls, lowConfidence, deathEconomy, deathWickets, deathShare };
}
