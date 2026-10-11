import {
  DEFAULT_POINTS_PROFILE,
  POINTS_PROFILES,
  type Bracket,
  type Milestone,
  type PointsProfile,
  type Range,
} from "@/config/points";
import type { Role } from "@/config/rules";

// One innings, spell, or set of fielding events. superOver rows are dropped when the table says so.
export interface BattingInnings {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
  superOver?: boolean;
}

export interface BowlingSpell {
  balls: number; // legal balls bowled (6 per over)
  runsConceded: number;
  wickets: number; // not run outs
  bowledOrLbw: number; // how many of those wickets were bowled or LBW
  maidens: number;
  superOver?: boolean;
}

export interface FieldingEvents {
  catches: number;
  stumpings: number;
  runOutsDirect: number;
  runOutsShared: number;
  superOver?: boolean;
}

export interface PlayerMatchStats {
  role: Role;
  inPlayingXI: boolean;
  batting?: BattingInnings[];
  bowling?: BowlingSpell[];
  fielding?: FieldingEvents[];
}

export interface PointLine {
  label: string;
  points: number;
}

export interface PlayerScore {
  total: number;
  lines: PointLine[]; // the working, so every total can be checked by hand
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Two decimals matches how the brackets are written and avoids float noise (150.00000000000003).
const round2 = (x: number) => Math.round(x * 100) / 100;

function inRange(x: number, r: Range): boolean {
  return (
    (r.gt === undefined || x > r.gt) &&
    (r.gte === undefined || x >= r.gte) &&
    (r.lt === undefined || x < r.lt) &&
    (r.lte === undefined || x <= r.lte)
  );
}

function findBracket(brackets: Bracket[], x: number): Bracket | undefined {
  return brackets.find((b) => inRange(x, b.range));
}

// Milestones do not stack: only the highest threshold reached counts.
function highestMilestone(milestones: Milestone[], value: number): Milestone | undefined {
  return milestones
    .filter((m) => value >= m.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];
}

export function scorePlayerMatch(
  stats: PlayerMatchStats,
  table: PointsProfile = POINTS_PROFILES[DEFAULT_POINTS_PROFILE],
): PlayerScore {
  // A player who was not in the playing XI scores nothing at all.
  if (!stats.inPlayingXI) return { total: 0, lines: [] };

  const lines: PointLine[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) lines.push({ label, points });
  };
  const regulation = <T extends { superOver?: boolean }>(rows: T[] = []) =>
    table.excludeSuperOver.value ? rows.filter((r) => !r.superOver) : rows;

  add("In playing XI", table.playingXI.value);

  // Batting
  const innings = regulation(stats.batting);
  if (innings.length > 0) {
    const runs = sum(innings.map((i) => i.runs));
    const balls = sum(innings.map((i) => i.balls));
    const dismissed = innings.some((i) => i.dismissed);
    const b = table.batting;

    add(`${runs} runs`, runs * b.run.value);
    add(`${sum(innings.map((i) => i.fours))} fours`, sum(innings.map((i) => i.fours)) * b.four.value);
    add(`${sum(innings.map((i) => i.sixes))} sixes`, sum(innings.map((i) => i.sixes)) * b.six.value);

    const milestone = highestMilestone(b.milestones, runs);
    if (milestone) add(`${milestone.threshold}-run bonus`, milestone.bonus.value);

    if (dismissed && runs === 0 && b.duckRoles.includes(stats.role)) {
      add("Duck", b.duck.value);
    }

    const sr = b.strikeRate;
    if (balls >= sr.minBalls.value && !sr.exemptRoles.includes(stats.role)) {
      const strikeRate = round2((runs * 100) / balls);
      const hit = findBracket(sr.bonus, strikeRate) ?? findBracket(sr.penalty, strikeRate);
      if (hit) add(`Strike rate ${strikeRate}`, hit.points.value);
    }
  }

  // Bowling
  const spells = regulation(stats.bowling);
  if (spells.length > 0) {
    const w = table.bowling;
    const balls = sum(spells.map((s) => s.balls));
    const runsConceded = sum(spells.map((s) => s.runsConceded));
    const wickets = sum(spells.map((s) => s.wickets));
    const bowledOrLbw = sum(spells.map((s) => s.bowledOrLbw));
    const maidens = sum(spells.map((s) => s.maidens));

    add(`${wickets} wickets`, wickets * w.wicket.value);
    add(`${bowledOrLbw} bowled/LBW`, bowledOrLbw * w.bowledOrLbwBonus.value);

    const milestone = highestMilestone(w.milestones, wickets);
    if (milestone) add(`${milestone.threshold}-wicket bonus`, milestone.bonus.value);

    add(`${maidens} maidens`, maidens * w.maiden.value);

    if (balls >= w.economy.minOvers.value * 6) {
      const economy = round2((runsConceded * 6) / balls);
      const hit = findBracket(w.economy.brackets, economy);
      if (hit) add(`Economy ${economy}`, hit.points.value);
    }
  }

  // Fielding
  const field = regulation(stats.fielding);
  if (field.length > 0) {
    const f = table.fielding;
    const catches = sum(field.map((e) => e.catches));
    add(`${catches} catches`, catches * f.catch.value);
    if (catches >= f.catchBonus.threshold) {
      add(`${f.catchBonus.threshold}-catch bonus`, f.catchBonus.bonus.value);
    }
    const stumpings = sum(field.map((e) => e.stumpings));
    add(`${stumpings} stumpings`, stumpings * f.stumping.value);
    const direct = sum(field.map((e) => e.runOutsDirect));
    add(`${direct} direct run outs`, direct * f.runOutDirect.value);
    const shared = sum(field.map((e) => e.runOutsShared));
    add(`${shared} shared run outs`, shared * f.runOutShared.value);
  }

  return { total: sum(lines.map((l) => l.points)), lines };
}
