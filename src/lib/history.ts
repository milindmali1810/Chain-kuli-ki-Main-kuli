import { DEFAULT_POINTS_PROFILE, POINTS_PROFILES, type PointsProfile } from "@/config/points";
import type { Role } from "@/config/rules";
import { scorePlayerMatch } from "./scorePlayerMatch";
import type { StatsNoRole } from "./inferRole";
import type { ParsedLine } from "./cricsheet";

// One player's stats row for one past match, as stored in player_match_lines.
export interface HistoryRow {
  playerId: number;
  matchId: number;
  date: string; // YYYY-MM-DD
  leagueTier: string; // international | franchise | domestic
  teamId: number | null;
  venueId: number | null;
  stats: StatsNoRole;
  phases?: ParsedLine["phases"]; // powerplay/middle/death splits, regular innings only
}

export interface PointsEntry {
  matchId: number;
  date: string;
  leagueTier: string;
  points: number;
}

// Turns a player's past matches into fantasy points, oldest first.
// Matches he was not in the XI for are skipped: no playing time, no points to learn from.
export function fantasyPointsSeries(
  rows: HistoryRow[],
  role: Role,
  table: PointsProfile = POINTS_PROFILES[DEFAULT_POINTS_PROFILE],
): PointsEntry[] {
  return rows
    .filter((r) => r.stats.inPlayingXI)
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchId - b.matchId)
    .map((r) => ({
      matchId: r.matchId,
      date: r.date,
      leagueTier: r.leagueTier,
      points: scorePlayerMatch({ role, ...r.stats }, table).total,
    }));
}

// Plain average of the most recent n matches; null when there are none (never a made-up zero).
export function averagePoints(series: PointsEntry[], lastN = 15): number | null {
  const recent = series.slice(-lastN);
  if (recent.length === 0) return null;
  return recent.reduce((a, e) => a + e.points, 0) / recent.length;
}
