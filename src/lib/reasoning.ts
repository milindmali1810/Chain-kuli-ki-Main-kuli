// The explanation layer. Gemini writes sentences; this file makes sure they stay honest.
//   1. FACTS: the numbers the engine produced are packed into one object.
//   2. Gemini is asked to explain using only those numbers.
//   3. GUARD: plain code rejects any sentence with a number that is not in FACTS, or a win/loss prediction.
//   4. A rejected (or missing) sentence is replaced by a template built only from FACTS.
// So the app can never show an invented statistic, and it still works when Gemini is down.

export interface PickFacts {
  playerId: number;
  name: string;
  role: string;
  team: string;
  opponent: string;
  credits: number;
  expectedPoints: number;
  rank: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  basePoints: number;
  recentMean: number | null;
  longMean: number | null;
  rolePrior: number;
  matchesUsed: number;
  lastPoints: number[];
  venueEffectPct: number; // 2.5 means +2.5%
  teamFormEffectPct: number;
  chanceOfPlayingPct: number;
  blankMatchesPct: number; // share of recent matches below the "blank" line
  // Only sent when relevant to the role (batting numbers for batters, overs for bowlers, both for all-rounders).
  avgBallsFaced?: number | null;
  avgOvers?: number | null;
  deathBonusPct: number;
  // deathBallsLast24Months is a window figure, never a career total.
  death: { profile: string | null; deathEconomy: number | null; deathBallsLast24Months: number } | null;
}

// The captain and vice-captain, in terms a person can repeat to their league group. Built by code from the same
// numbers the engine used, so Gemini never sees the internal "captain score", only the reasons behind it.
export interface CaptainCandidateFacts {
  name: string;
  role: string; // e.g. "bowler"
  whyEligible: string; // plain sentence about his role in the match
  expectedPointsIfPlaying: number;
  chanceOfPlayingPct: number;
  quietMatchPct: number; // share of recent matches in which he had a dud (under 20 points)
  mostRecentScores: number[]; // oldest to newest, the last three
}

export interface CaptainCase {
  howDecided: string;
  captain: CaptainCandidateFacts;
  runnerUp: (CaptainCandidateFacts & { whyBehind: string }) | null;
  vice: { name: string; role: string; expectedPointsIfPlaying: number; chanceOfPlayingPct: number; mostRecentScores: number[]; routeNote: string } | null;
}

const ROLE_WORD: Record<string, string> = { WK: "wicket-keeper", BAT: "batter", AR: "all-rounder", BOWL: "bowler" };
const route = (role: string) => (role === "BAT" || role === "WK" ? "batting" : role === "BOWL" ? "bowling" : "batting and bowling");

function whyEligible(p: PickFacts): string {
  if (p.role === "BOWL") return p.avgOvers ? `he is a front-line bowler who averages ${p.avgOvers} overs a match` : "he is a front-line bowler";
  if (p.role === "AR") return p.avgBallsFaced && p.avgOvers ? `he does both jobs: about ${p.avgBallsFaced} balls faced and ${p.avgOvers} overs bowled a match` : "he does both jobs";
  return p.avgBallsFaced ? `he bats long, averaging ${p.avgBallsFaced} balls an innings` : "he is a key batter";
}

const expectedIfPlaying = (p: PickFacts) => Math.round((p.expectedPoints / Math.max(p.chanceOfPlayingPct / 100, 0.01)) * 10) / 10;

function candidateFacts(p: PickFacts): CaptainCandidateFacts {
  return {
    name: p.name,
    role: ROLE_WORD[p.role] ?? p.role,
    whyEligible: whyEligible(p),
    expectedPointsIfPlaying: expectedIfPlaying(p),
    chanceOfPlayingPct: p.chanceOfPlayingPct,
    quietMatchPct: p.blankMatchesPct,
    mostRecentScores: p.lastPoints.slice(-3),
  };
}

// `orderedNames`: the eligible captain candidates, best first (from the engine's own ranking).
export function buildCaptainCase(picks: PickFacts[], orderedNames: string[]): CaptainCase | null {
  const cap = picks.find((p) => p.isCaptain);
  if (!cap) return null;
  const vice = picks.find((p) => p.isViceCaptain);
  const runner = picks.find((p) => p.name === orderedNames.find((n) => n !== cap.name));

  let runnerUp: CaptainCase["runnerUp"] = null;
  if (runner) {
    const c = candidateFacts(cap);
    const r = candidateFacts(runner);
    const reasons: string[] = [];
    if (r.expectedPointsIfPlaying < c.expectedPointsIfPlaying - 0.5) reasons.push(`we expect fewer points from him (${r.expectedPointsIfPlaying} against ${c.expectedPointsIfPlaying})`);
    if (r.quietMatchPct > c.quietMatchPct + 2) reasons.push(`he has quiet matches more often (${r.quietMatchPct}% of recent matches against ${c.quietMatchPct}%)`);
    if (r.chanceOfPlayingPct < c.chanceOfPlayingPct) reasons.push(`he is less certain to play (${r.chanceOfPlayingPct}% against ${c.chanceOfPlayingPct}%)`);
    runnerUp = { ...r, whyBehind: reasons.length ? reasons.join(" and ") : "the two are very close and the gap is small" };
  }

  return {
    howDecided:
      "The captain scores double, so he is the player with the best mix of points we expect and reliability, chosen only from players who are almost certain to play and have a big role. The vice-captain is the next best player, with a small preference for someone who earns points a different way, so one bad pitch does not hurt both.",
    captain: candidateFacts(cap),
    runnerUp,
    vice: vice
      ? {
          name: vice.name,
          role: ROLE_WORD[vice.role] ?? vice.role,
          expectedPointsIfPlaying: expectedIfPlaying(vice),
          chanceOfPlayingPct: vice.chanceOfPlayingPct,
          mostRecentScores: vice.lastPoints.slice(-3),
          routeNote:
            route(vice.role) !== route(cap.role)
              ? `he earns points differently from the captain (${route(vice.role)} against ${route(cap.role)}), so the two do not depend on the same thing`
              : "he is the next best player after the captain",
        }
      : null,
  };
}

export interface ContextFacts {
  stage: "provisional" | "final";
  matchLabel: string; // e.g. "West Indies v India"
  date: { day: number; month: number; year: number };
  venue: string;
  pitch: { tag: string; indexPct: number | null; matches: number; lowConfidence: boolean };
  weather: { tempC: number | null; humidityPct: number | null; dewPointC: number | null; rainMm: number | null; cloudPct: number | null; windKmh: number | null } | null;
  teamFormEffectPct: Record<string, number | null>;
  totalCredits: number;
  creditCap: number;
  creditsAreSeeded: boolean;
  composition: { byRole: Record<string, number>; byTeam: Record<string, number> };
  deathWindowMonths: number; // death-over numbers cover this many months, so "24 months" is a real fact
  deathLog: string[];
  unavailableFactors: string[];
  captaincy: CaptainCase | null;
}

export interface Facts {
  context: ContextFacts;
  picks: PickFacts[];
}

// ---------- The schema Gemini must fill ----------
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { playerId: { type: "integer" }, reason: { type: "string" } },
        required: ["playerId", "reason"],
      },
    },
    captain: {
      type: "object",
      properties: { playerId: { type: "integer" }, reason: { type: "string" }, whyNotRunnerUp: { type: "string" } },
      required: ["playerId", "reason", "whyNotRunnerUp"],
    },
    viceCaptain: {
      type: "object",
      properties: { playerId: { type: "integer" }, reason: { type: "string" } },
      required: ["playerId", "reason"],
    },
    pitchReport: { type: "string" },
    summary: { type: "string" },
  },
  required: ["picks", "captain", "viceCaptain", "pitchReport", "summary"],
} as const;

export const SYSTEM_PROMPT = [
  "You write short explanations for a fantasy cricket team that a computer program has ALREADY chosen.",
  "You do not choose players, change the team, check rules, or predict who will win. Only explain.",
  "Use ONLY the numbers in FACTS. Copy each number exactly. Never invent, round differently, or add any statistic, name or event that is not in FACTS.",
  "Do NOT calculate anything: no differences, sums, averages or percentages of your own. Only copy numbers that are already in FACTS.",
  "Write natural phrases a fan could repeat to friends. Never use field names such as recentMean, lastPoints or deathBallsLast24Months, and never use internal jargon: do not write \"captain score\", \"captaincy score\", \"captain race\", \"projection\", \"metric\" or \"index\".",
  "Explain what a statistic MEANS in cricket terms instead of just quoting it: for example, averaging 25 balls an innings means he usually bats long; averaging 3.6 overs means he is a front-line bowler who bowls his full quota.",
  "lastPoints runs from oldest to newest, so the LAST items are the most recent matches. When you cite recent scores, cite the most recent ones in that order. Do not pick only the highest scores. If blankMatchesPct is 30 or more, say he often has quiet matches.",
  "Death-over numbers cover the last 24 months, not a career.",
  "If a whole block such as weather is null, write that it is unavailable. Never write the word null.",
  "In a pick's sentence use ONLY that player's own numbers plus the match context. Never quote another player's numbers there.",
  "Every pick: 1 or 2 sentences, at most 40 words, citing at least 2 different numbers from that player's own facts.",
  "Lead with the most decisive factor for THAT player: his lastPoints (recent scores), role-specific numbers (balls faced for batters, overs for bowlers), or a venue, team-form or death-over effect that is not zero. Mention the opponent or venue when it moved his number.",
  "Vary the wording. Do not start every sentence with the player's name and do not repeat the same phrase for every player.",
  "Skip any field that is missing or zero; do not mention it. Only say a relevant number is unavailable if FACTS shows null for a stat that matters for his role.",
  "Captain: 2 or 3 sentences using ONLY context.captaincy. Say why he is trusted with the armband in cricket terms: his role in this match (whyEligible), his most recent scores in order, how reliable he is (quietMatchPct, chanceOfPlayingPct), and the points we expect from him. Then in whyNotRunnerUp, say in plain words why the runner-up is just behind, using runnerUp.whyBehind. Never mention a score that is not listed.",
  "Vice-captain: 1 or 2 sentences using context.captaincy.vice: why he is the backup, using routeNote, his recent scores and the points we expect.",
  "pitchReport: 2 sentences on the pitch and weather, only from FACTS; say what the numbers do and do not tell us. summary: 2 sentences on the team: credits used against the cap and the role and team make-up from composition.",
  "Plain English. No hype. Never write that a team will win or lose.",
].join("\n");

export function buildPrompt(facts: Facts): string {
  return `FACTS (JSON):\n${JSON.stringify(facts, null, 1)}\n\nWrite the explanation JSON for every player in FACTS.picks, the captain, the vice-captain, the pitchReport and the summary.`;
}

// ---------- The guard ----------
// The numbers a sentence may use. Every number that appears in the facts in the forms a writer might use.
// With `pickId`, only that player's own numbers plus the match context: a sentence about one player may not
// quote another player's figures (which would pass a whole-facts check but be wrong).
export function allowedNumbers(facts: Facts, pickId?: number): Set<number> {
  const out = new Set<number>();
  const add = (n: number) => {
    out.add(n);
    out.add(Math.round(n * 10) / 10);
    out.add(Math.round(n * 100) / 100);
    out.add(Math.abs(n));
    // Whole-number rounding only for 10 and above (44.3 may be written 44). For small numbers it would let an
    // invented "3" through just because some fact is 2.5 or 3.8.
    if (Math.abs(n) >= 10) out.add(Math.round(n));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) add(v);
    else if (typeof v === "string") for (const m of v.match(/-?\d+(?:\.\d+)?/g) ?? []) add(Number(m));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  if (pickId === undefined) walk(facts);
  else {
    // The captaincy block holds OTHER players' numbers (runner-up, vice-captain), so a single player's sentence
    // does not get it. Only the captain, vice-captain, pitch and summary sentences use the whole facts.
    walk({ ...facts.context, captaincy: null });
    walk(facts.picks.find((p) => p.playerId === pickId));
  }
  return out;
}

// Numbers in `text` that are not in the allowed set. Thousands commas are tolerated ("1,000").
export function ungroundedNumbers(text: string, allowed: Set<number>): string[] {
  const found = text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? [];
  return found.filter((raw) => {
    const n = Number(raw);
    return ![...allowed].some((a) => Math.abs(a - n) < 0.051);
  });
}

const WIN_PREDICTION = /\b(will win|to win|going to win|will lose|likely to win|favou?rites?|win the match|win this match|wins? the game)\b/i;
// Internal bookkeeping words that mean nothing to a fan. A sentence using them is replaced by a plain template.
const JARGON = /\b(captain(?:cy)?[\s-]*scores?|captain race|expected points (?:projection|total|tally|figure|mark|value)|projection|metric|index of)\b|captainScore|recentMean|lastPoints|\bnull\b/i;

export function checkText(text: unknown, allowed: Set<number>): { ok: true; text: string } | { ok: false; why: string } {
  if (typeof text !== "string" || text.trim().length === 0) return { ok: false, why: "empty" };
  const bad = ungroundedNumbers(text, allowed);
  if (bad.length > 0) return { ok: false, why: `number(s) not in the facts: ${bad.join(", ")}` };
  if (WIN_PREDICTION.test(text)) return { ok: false, why: "win/loss prediction" };
  if (JARGON.test(text)) return { ok: false, why: "internal jargon a fan could not repeat" };
  return { ok: true, text: text.trim() };
}

// ---------- Plain templates, built only from FACTS ----------
const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;

export function templatePick(p: PickFacts): string {
  const parts = [
    `${p.name} (${p.role}, ${p.team}, ${p.credits} credits): expected ${p.expectedPoints} points, based on ${p.matchesUsed} recent matches (last scores ${p.lastPoints.join(", ") || "unavailable"}).`,
  ];
  if (p.venueEffectPct !== 0) parts.push(`Venue effect ${pct(p.venueEffectPct)}.`);
  if (p.teamFormEffectPct !== 0) parts.push(`Team form effect ${pct(p.teamFormEffectPct)}.`);
  if (p.chanceOfPlayingPct < 100) parts.push(`Chance of playing ${p.chanceOfPlayingPct}%.`);
  if (p.death?.profile) parts.push(`Death-over specialist (${p.death.profile}), ${p.death.deathBallsLast24Months} death balls in the last 24 months${p.deathBonusPct ? `, +${p.deathBonusPct}% bonus` : ""}.`);
  return parts.join(" ");
}

const recent = (xs: number[]) => (xs.length ? xs.map((x) => Math.round(x)).join(", ") : "unavailable");

export function templateCaptain(facts: Facts, p: PickFacts): { reason: string; whyNotRunnerUp: string } {
  const c = facts.context.captaincy;
  const cap = c?.captain;
  const reason = cap
    ? `${p.name} is captain because ${cap.whyEligible}. We expect about ${cap.expectedPointsIfPlaying} points from him, he is ${cap.chanceOfPlayingPct}% likely to play, and he had a quiet match in only ${cap.quietMatchPct}% of his recent matches. His latest scores: ${recent(cap.mostRecentScores)}.`
    : `${p.name} is captain: the best mix of points we expect and reliability.`;
  const ru = c?.runnerUp;
  const whyNotRunnerUp = ru
    ? `${ru.name} was a close second, but ${ru.whyBehind}.`
    : "No other player met the rules to be captain.";
  return { reason, whyNotRunnerUp };
}

export function templateVice(facts: Facts, p: PickFacts): string {
  const v = facts.context.captaincy?.vice;
  return v
    ? `${p.name} is vice-captain: ${v.routeNote}. We expect about ${v.expectedPointsIfPlaying} points from him and his latest scores are ${recent(v.mostRecentScores)}.`
    : `${p.name} is vice-captain: the next best choice after the captain.`;
}

export function templatePitch(c: ContextFacts): string {
  const pitch = `Pitch: ${c.pitch.tag.replace("_", " ").toLowerCase()}${c.pitch.indexPct === null ? " (no venue history, treated as neutral)" : ` (${pct(c.pitch.indexPct)} against the competition average over ${c.pitch.matches} matches${c.pitch.lowConfidence ? ", low confidence" : ""})`}.`;
  const w = c.weather;
  const weather = w
    ? ` Evening conditions: ${w.tempC ?? "unavailable"} C, humidity ${w.humidityPct ?? "unavailable"}%, rain ${w.rainMm ?? "unavailable"} mm, wind ${w.windKmh ?? "unavailable"} km/h.`
    : " Weather unavailable.";
  return pitch + weather;
}

export function templateSummary(c: ContextFacts): string {
  return `Eleven players for ${c.matchLabel}, costing ${c.totalCredits} of ${c.creditCap} credits${c.creditsAreSeeded ? " (credits are seeded, not Dream11's own)" : ""}. The ${c.stage} team follows the active rules profile and every pick is checked by the rules validator.`;
}

// ---------- Put it together ----------
export interface Explanation {
  picks: Map<number, { text: string; source: "gemini" | "template" }>;
  captain: { reason: string; whyNotRunnerUp: string; source: "gemini" | "template" };
  viceCaptain: { reason: string; source: "gemini" | "template" };
  pitchReport: { text: string; source: "gemini" | "template" };
  summary: { text: string; source: "gemini" | "template" };
  report: { acceptedFromGemini: number; replacedByTemplate: number; rejections: string[] };
}

// `raw` is whatever Gemini returned (or null when Gemini was not used or failed).
export function assembleExplanation(facts: Facts, raw: unknown): Explanation {
  const allowed = allowedNumbers(facts);
  const rejections: string[] = [];
  let accepted = 0;
  let replaced = 0;

  // What Gemini may have returned. Anything else is ignored and replaced by templates.
  interface RawOutput {
    picks?: { playerId?: unknown; reason?: unknown }[];
    captain?: { playerId?: unknown; reason?: unknown; whyNotRunnerUp?: unknown };
    viceCaptain?: { playerId?: unknown; reason?: unknown };
    pitchReport?: unknown;
    summary?: unknown;
  }
  const r: RawOutput = raw && typeof raw === "object" ? (raw as RawOutput) : {};
  const choose = (
    label: string,
    candidate: unknown,
    fallback: string,
    allowedHere: Set<number> = allowed,
  ): { text: string; source: "gemini" | "template" } => {
    if (candidate === undefined || candidate === null) {
      replaced += 1;
      return { text: fallback, source: "template" };
    }
    const checked = checkText(candidate, allowedHere);
    if (checked.ok) {
      accepted += 1;
      return { text: checked.text, source: "gemini" };
    }
    replaced += 1;
    rejections.push(`${label}: ${checked.why}`);
    return { text: fallback, source: "template" };
  };

  const byId = new Map<number, unknown>();
  if (Array.isArray(r.picks)) for (const p of r.picks) if (p && Number.isInteger(p.playerId)) byId.set(p.playerId as number, p.reason);

  const picks = new Map<number, { text: string; source: "gemini" | "template" }>();
  for (const p of facts.picks) picks.set(p.playerId, choose(p.name, byId.get(p.playerId), templatePick(p), allowedNumbers(facts, p.playerId)));

  const cap = facts.picks.find((p) => p.isCaptain);
  const vice = facts.picks.find((p) => p.isViceCaptain);
  // Gemini must be talking about the right player: ignore its text if the id does not match.
  const capTpl = cap ? templateCaptain(facts, cap) : { reason: "No captain.", whyNotRunnerUp: "" };
  const capRaw = r.captain && cap && r.captain.playerId === cap.playerId ? r.captain : null;
  const captainReason = choose("captain", capRaw?.reason, capTpl.reason);
  const captainWhy = choose("captain runner-up", capRaw?.whyNotRunnerUp, capTpl.whyNotRunnerUp);
  const viceRaw = r.viceCaptain && vice && r.viceCaptain.playerId === vice.playerId ? r.viceCaptain : null;
  const viceReason = choose("vice-captain", viceRaw?.reason, vice ? templateVice(facts, vice) : "No vice-captain.");
  const pitch = choose("pitch report", r.pitchReport, templatePitch(facts.context));
  const summary = choose("summary", r.summary, templateSummary(facts.context));

  return {
    picks,
    captain: { reason: captainReason.text, whyNotRunnerUp: captainWhy.text, source: captainReason.source },
    viceCaptain: { reason: viceReason.text, source: viceReason.source },
    pitchReport: pitch,
    summary,
    report: { acceptedFromGemini: accepted, replacedByTemplate: replaced, rejections },
  };
}
