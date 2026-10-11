import { ROLE_INFERENCE, type RoleInferenceConfig } from "@/config/roleInference";
import type { Role } from "@/config/rules";
import type { PlayerMatchStats } from "./scorePlayerMatch";

export type StatsNoRole = Omit<PlayerMatchStats, "role">;

// Roles for everyone in a set of history rows, using only those rows. Because the rows are already limited to
// "before the match", a backtest of an older match never sees roles learned from later matches.
export function inferRolesFromRows(
  rows: { playerId: number; stats: StatsNoRole }[],
  cfg: RoleInferenceConfig = ROLE_INFERENCE,
): Map<number, Role> {
  const byPlayer = new Map<number, StatsNoRole[]>();
  for (const r of rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r.stats]);
  const roles = new Map<number, Role>();
  for (const [id, stats] of byPlayer) {
    const role = inferRole(stats, cfg);
    if (role) roles.set(id, role);
  }
  return roles;
}

// Guesses a role from one player's match rows (already limited to the right time window).
// Returns null when there is too little data: missing data stays missing, it is never invented.
export function inferRole(rows: StatsNoRole[], cfg: RoleInferenceConfig = ROLE_INFERENCE): Role | null {
  const played = rows.filter((r) => r.inPlayingXI);
  if (played.length < cfg.minMatches.value) return null;

  let stumpings = 0;
  let bowlMatches = 0;
  let bowledBalls = 0;
  let battedMatches = 0;
  let ballsFaced = 0;

  for (const r of played) {
    // Super Over rows are not part of normal role behaviour.
    const innings = (r.batting ?? []).filter((i) => !i.superOver);
    const spells = (r.bowling ?? []).filter((s) => !s.superOver);
    const field = (r.fielding ?? []).filter((f) => !f.superOver);

    stumpings += field.reduce((a, f) => a + f.stumpings, 0);
    const balls = spells.reduce((a, s) => a + s.balls, 0);
    if (balls >= 6) {
      bowlMatches += 1;
      bowledBalls += balls;
    }
    if (innings.length > 0) {
      battedMatches += 1;
      ballsFaced += innings.reduce((a, i) => a + i.balls, 0);
    }
  }

  if (stumpings >= cfg.wkMinStumpings.value) return "WK";

  const bowlShare = bowlMatches / played.length;
  const avgOvers = bowlMatches > 0 ? bowledBalls / 6 / bowlMatches : 0;
  if (bowlShare < cfg.minBowlShare.value || avgOvers < cfg.minAvgOvers.value) return "BAT";

  const batShare = battedMatches / played.length;
  const avgBalls = battedMatches > 0 ? ballsFaced / battedMatches : 0;
  return batShare >= cfg.arMinBatShare.value && avgBalls >= cfg.arMinAvgBallsFaced.value ? "AR" : "BOWL";
}
