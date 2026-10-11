import { DEFAULT_RULES_PROFILE, RULES_PROFILES, ROLES, type Role, type RulesProfile } from "@/config/rules";
import type { Player, Team } from "./types";
import { validateTeam, type ValidationResult } from "./validateTeam";

// The pure logic behind the "edit and confirm my team" screen. It runs in the browser (live feedback while editing)
// and again on the server (before anything is saved), so both always agree. No database, no network.

export interface EditorPlayer {
  id: number;
  name: string;
  team: string;
  role: Role;
  credits: number;
}

// open: before the match starts. locked: started, no result yet. practice: already played, so editing is for
// learning only and is clearly labelled as such.
export type EditMode = "open" | "practice" | "locked";

export function editMode(now: Date, startTime: string, hasActual: boolean): EditMode {
  if (hasActual) return "practice";
  return now.getTime() < new Date(startTime).getTime() ? "open" : "locked";
}

export function buildTeam(pool: EditorPlayer[], ids: number[], captainId: number | null, viceCaptainId: number | null): Team {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const players: Player[] = ids
    .map((id) => byId.get(id))
    .filter((p): p is EditorPlayer => p !== undefined)
    .map((p) => ({ id: String(p.id), name: p.name, team: p.team, role: p.role, credits: p.credits }));
  return {
    players,
    captainId: captainId === null ? undefined : String(captainId),
    viceCaptainId: viceCaptainId === null ? undefined : String(viceCaptainId),
  };
}

export interface SelectionCheck {
  result: ValidationResult;
  credits: number;
  count: number;
  roleCounts: Record<Role, number>;
  teamCounts: Record<string, number>;
  rules: RulesProfile;
}

// Checks a selection with the SAME validator the agent's team goes through. Ids outside the pool are reported, not ignored.
export function checkSelection(
  pool: EditorPlayer[],
  ids: number[],
  captainId: number | null,
  viceCaptainId: number | null,
  rules: RulesProfile = RULES_PROFILES[DEFAULT_RULES_PROFILE],
): SelectionCheck {
  const team = buildTeam(pool, ids, captainId, viceCaptainId);
  const result = validateTeam(team, rules);
  const poolIds = new Set(pool.map((p) => p.id));
  const stray = ids.filter((id) => !poolIds.has(id));
  if (stray.length > 0) {
    result.violations.push({ code: "TEAM_SIZE", message: `${stray.length} selected player(s) are not available for this match.` });
    result.valid = false;
  }
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  const teamCounts: Record<string, number> = {};
  for (const p of team.players) {
    roleCounts[p.role] += 1;
    teamCounts[p.team] = (teamCounts[p.team] ?? 0) + 1;
  }
  return {
    result,
    credits: Math.round(team.players.reduce((a, p) => a + p.credits, 0) * 10) / 10,
    count: team.players.length,
    roleCounts,
    teamCounts,
    rules,
  };
}

export interface Diff {
  removed: string[];
  added: string[];
  captainChanged: boolean;
  viceCaptainChanged: boolean;
  same: boolean;
}

// What Aryan changed compared with the agent's recommendation, by name.
export function diffFromAgent(
  pool: EditorPlayer[],
  agent: { ids: number[]; captainId: number | null; viceId: number | null },
  mine: { ids: number[]; captainId: number | null; viceId: number | null },
): Diff {
  const name = (id: number) => pool.find((p) => p.id === id)?.name ?? String(id);
  const a = new Set(agent.ids);
  const m = new Set(mine.ids);
  const removed = agent.ids.filter((id) => !m.has(id)).map(name);
  const added = mine.ids.filter((id) => !a.has(id)).map(name);
  const captainChanged = agent.captainId !== mine.captainId;
  const viceCaptainChanged = agent.viceId !== mine.viceId;
  return { removed, added, captainChanged, viceCaptainChanged, same: removed.length === 0 && added.length === 0 && !captainChanged && !viceCaptainChanged };
}
