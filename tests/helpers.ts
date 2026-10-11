import type { Role } from "@/config/rules";
import type { Player, Team } from "@/lib/types";

// A valid strict-profile lineup: 1 WK, 4 BAT, 2 AR, 4 BOWL = 11 players.
export const VALID_ROLES: Role[] = [
  "WK", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL",
];

export function makePlayer(n: number, role: Role, team: string, credits = 9): Player {
  return { id: `p${n}`, name: `Player ${n}`, team, role, credits };
}

// Builds a team from a list of roles. By default 6 players from "Team A", 5 from "Team B",
// 9 credits each (99 total), captain p1, vice-captain p2.
export function teamFromRoles(
  roles: Role[],
  options: { teams?: string[]; credits?: number[] } = {},
): Team {
  const players = roles.map((role, i) =>
    makePlayer(
      i + 1,
      role,
      options.teams?.[i] ?? (i < 6 ? "Team A" : "Team B"),
      options.credits?.[i] ?? 9,
    ),
  );
  return { players, captainId: "p1", viceCaptainId: "p2" };
}

export const validTeam = () => teamFromRoles(VALID_ROLES);
