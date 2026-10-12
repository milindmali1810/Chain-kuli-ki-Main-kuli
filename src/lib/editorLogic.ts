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

export interface Reconciliation {
  computed: number; // our calculation from the per-player points, with captain and vice-captain extras
  reported: number; // the team total Aryan read off Dream11
  difference: number; // reported minus computed
  matches: boolean;
  message: string;
}

// Compares the team total Dream11 shows with our own calculation from the per-player points. A match supports our
// points table; a gap points to a rule that differs from Dream11's (or a typing slip). Half a point is the tolerance.
export function reconcile(computed: number, reported: number | null): Reconciliation | null {
  if (reported === null || !Number.isFinite(reported)) return null;
  const difference = Math.round((reported - computed) * 10) / 10;
  const matches = Math.abs(difference) <= 0.5;
  return {
    computed,
    reported,
    difference,
    matches,
    message: matches
      ? "Our calculation matches the Dream11 total you entered, which supports our points table."
      : `Our calculation is ${computed} but Dream11 showed ${reported} (a difference of ${difference > 0 ? "+" : ""}${difference}). That usually means a points rule in our table differs from Dream11's, or a player's points were typed differently.`,
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

// Who to suggest when Aryan takes a player out: players who cost the SAME credits first (a like-for-like swap), then
// anyone who still fits in the credits left, then the rest; dearest first within each group, then by name.
// creditsLeft already includes the credits freed by the removal.
export function orderReplacements<T extends { credits: number; name: string }>(available: T[], creditsLeft: number, removedCredits: number | null): T[] {
  const rank = (p: T) => (removedCredits !== null && p.credits === removedCredits ? 0 : p.credits <= creditsLeft ? 1 : 2);
  return [...available].sort((a, b) => rank(a) - rank(b) || b.credits - a.credits || a.name.localeCompare(b.name));
}
