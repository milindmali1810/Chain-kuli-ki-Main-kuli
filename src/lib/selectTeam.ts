import { RUBRIC, type RubricConfig } from "@/config/rubric";
import { ROLES, type Role, type RulesProfile } from "@/config/rules";

// The deterministic selection engine. Gemini never picks players: this code does, and the rules
// validator (validateTeam) has the last word on whether the result is legal.

export interface Candidate {
  id: number;
  name: string;
  team: string;
  role: Role;
  credits: number;
  pPlay: number; // chance he plays, 1 once the XI is confirmed
  expectedIfPlays: number; // adjusted expected fantasy points if he plays
  expected: number; // pPlay x expectedIfPlays (+ death bonus): this is what the search maximises
  blankRate: number; // share of recent matches below the "blank" line, 0 to 1
  avgBallsFaced: number | null; // stand-ins for batting order and bowling quota, which we do not have
  avgOvers: number | null;
}

export interface Selection {
  players: Candidate[];
  score: number; // sum of expected points plus the captain and vice-captain extras (the search objective)
  totalCredits: number;
  nodesVisited: number;
}

// Objective = sum of expected + (captain extra 1.0 x best) + (vice extra 0.5 x second best).
const objective = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => b - a);
  return xs.reduce((a, b) => a + b, 0) + (sorted[0] ?? 0) + 0.5 * (sorted[1] ?? 0);
};

// Finds the best legal team. Exact (branch and bound), not a heuristic. Returns null if no legal team exists.
export function selectTeam(
  pool: Candidate[],
  rules: RulesProfile,
  options: { forcedIds?: number[] } = {},
): Selection | null {
  const size = rules.teamSize.value;
  const cap = rules.creditCap.value;
  const maxPerTeam = rules.maxPerTeam.value;
  const roleMin = Object.fromEntries(ROLES.map((r) => [r, rules.roleLimits[r].min.value])) as Record<Role, number>;
  const roleMax = Object.fromEntries(ROLES.map((r) => [r, rules.roleLimits[r].max.value])) as Record<Role, number>;

  const forced = new Set(options.forcedIds ?? []);
  const sorted = [...pool].filter((c) => !forced.has(c.id)).sort((a, b) => b.expected - a.expected || a.credits - b.credits);
  const forcedPlayers = pool.filter((c) => forced.has(c.id));
  const bestTwo = [...pool].map((c) => c.expected).sort((a, b) => b - a);
  const captainExtraMax = (bestTwo[0] ?? 0) + 0.5 * (bestTwo[1] ?? 0);

  const roleCount: Record<Role, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  const teamCount = new Map<string, number>();
  const chosen: Candidate[] = [];
  let credits = 0;
  let nodes = 0;
  let best: { players: Candidate[]; score: number; credits: number } | null = null;

  const canAdd = (c: Candidate) =>
    credits + c.credits <= cap + 1e-9 &&
    (teamCount.get(c.team) ?? 0) < maxPerTeam &&
    roleCount[c.role] < roleMax[c.role];
  const add = (c: Candidate) => {
    chosen.push(c);
    credits += c.credits;
    roleCount[c.role] += 1;
    teamCount.set(c.team, (teamCount.get(c.team) ?? 0) + 1);
  };
  const remove = () => {
    const c = chosen.pop()!;
    credits -= c.credits;
    roleCount[c.role] -= 1;
    teamCount.set(c.team, (teamCount.get(c.team) ?? 0) - 1);
  };

  for (const f of forcedPlayers) {
    if (!canAdd(f)) return null; // the forced player already breaks a rule
    add(f);
  }

  const search = (i: number) => {
    nodes += 1;
    const need = size - chosen.length;
    if (need === 0) {
      if (ROLES.every((r) => roleCount[r] >= roleMin[r])) {
        const score = objective(chosen.map((c) => c.expected));
        const better = !best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && credits < best.credits);
        if (better) best = { players: [...chosen], score, credits };
      }
      return;
    }
    if (sorted.length - i < need) return;
    // Cannot still reach every role minimum with the places left.
    const missing = ROLES.reduce((a, r) => a + Math.max(0, roleMin[r] - roleCount[r]), 0);
    if (missing > need) return;
    // Upper bound: the best `need` remaining players, plus the largest possible captain extras.
    if (best) {
      let bound = chosen.reduce((a, c) => a + c.expected, 0) + captainExtraMax;
      for (let k = i; k < i + need; k++) bound += sorted[k].expected;
      if (bound < best.score - 1e-9) return;
    }
    const c = sorted[i];
    if (canAdd(c)) {
      add(c);
      search(i + 1);
      remove();
    }
    search(i + 1);
  };
  search(0);

  if (!best) return null;
  const found: { players: Candidate[]; score: number; credits: number } = best;
  return { players: found.players, score: found.score, totalCredits: Math.round(found.credits * 10) / 10, nodesVisited: nodes };
}

// ---------- Death-bowler slot rule (RUBRIC section 6) ----------
export interface DeathPick {
  bonusId: number | null;
  forcedIds: number[];
  log: string[];
}

export function applyDeathRule(
  pool: Candidate[],
  specialists: { id: number; score: number }[], // eligible death specialists in the pool, with DEATH_SCORE
  cfg: RubricConfig = RUBRIC,
): DeathPick {
  if (specialists.length === 0) {
    return { bonusId: null, forcedIds: [], log: ["No death specialist found in this pool (fallback needs bowling type, which is unavailable): rule not applied."] };
  }
  const top = [...specialists].sort((a, b) => b.score - a.score)[0];
  const ranked = [...pool].sort((a, b) => b.expected - a.expected);
  const rank = ranked.findIndex((c) => c.id === top.id) + 1;
  const name = pool.find((c) => c.id === top.id)?.name ?? String(top.id);
  const limit = cfg.death.rankTop.value;
  if (rank > 0 && rank <= limit) {
    return { bonusId: top.id, forcedIds: [top.id], log: [`${name} is the best death specialist (rank ${rank} of ${pool.length} on expected points): +${cfg.death.bonus.value * 100}% and a guaranteed slot.`] };
  }
  return { bonusId: null, forcedIds: [], log: [`${name} is the best death specialist but ranks ${rank} of ${pool.length} (needs the top ${limit}): dropped, no bonus and no guaranteed slot.`] };
}

// ---------- Captain and vice-captain (RUBRIC section 9) ----------
export interface CaptainChoice {
  captainId: number | null;
  viceCaptainId: number | null;
  scores: { id: number; name: string; captainScore: number | null; viceScore: number | null }[];
  notes: string[];
}

const route = (r: Role): "bat" | "bowl" | "both" => (r === "BAT" || r === "WK" ? "bat" : r === "BOWL" ? "bowl" : "both");

function captainEligible(c: Candidate, cfg: RubricConfig): boolean {
  if (c.pPlay < cfg.captain.pPlayMin.value) return false;
  const balls = c.avgBallsFaced ?? 0;
  const overs = c.avgOvers ?? 0;
  if (c.role === "BAT" || c.role === "WK") return balls >= cfg.captain.minAvgBallsBat.value;
  if (c.role === "BOWL") return overs >= cfg.captain.minAvgOversBowl.value;
  return balls >= cfg.captain.arMinBalls.value && overs >= cfg.captain.arMinOvers.value;
}

export function chooseCaptains(team: Candidate[], cfg: RubricConfig = RUBRIC): CaptainChoice {
  const notes: string[] = [];
  // Captain score = expected points if he plays x floor factor (chance he plays x chance he does not blank).
  const capScore = (c: Candidate) => c.expectedIfPlays * c.pPlay * (1 - c.blankRate);

  const eligible = team.filter((c) => captainEligible(c, cfg));
  let captain: Candidate | undefined;
  if (eligible.length > 0) {
    captain = [...eligible].sort((a, b) => capScore(b) - capScore(a) || b.credits - a.credits)[0];
  } else {
    captain = [...team].sort((a, b) => b.expected - a.expected)[0];
    notes.push("No player met the captain eligibility rules; fell back to the highest expected points.");
  }

  const vcPool = team.filter((c) => c.id !== captain?.id && c.pPlay >= cfg.captain.vcPPlayMin.value);
  const vcScore = (c: Candidate) =>
    c.expected * (1 + (captain && route(c.role) !== route(captain.role) ? cfg.captain.diversify.value : 0));
  let vice = [...vcPool].sort((a, b) => vcScore(b) - vcScore(a))[0];
  if (!vice) {
    vice = team.filter((c) => c.id !== captain?.id).sort((a, b) => b.expected - a.expected)[0];
    notes.push("No other player met the vice-captain availability rule; fell back to the highest expected points.");
  }

  return {
    captainId: captain?.id ?? null,
    viceCaptainId: vice?.id ?? null,
    scores: team.map((c) => ({
      id: c.id,
      name: c.name,
      captainScore: captainEligible(c, cfg) ? capScore(c) : null,
      viceScore: c.id === captain?.id ? null : vcScore(c),
    })),
    notes,
  };
}
