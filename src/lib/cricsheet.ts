import type { BattingInnings, BowlingSpell, FieldingEvents, PlayerMatchStats } from "./scorePlayerMatch";

// Turns one Cricsheet ball-by-ball match into one stats row per player.
// Pure function: no network, no database. The ingestion script does the I/O.

// ---- The parts of the Cricsheet JSON we read ----
interface CsFielder {
  name?: string;
  substitute?: boolean;
}
interface CsWicket {
  player_out: string;
  kind: string;
  fielders?: CsFielder[];
}
interface CsDelivery {
  batter: string;
  bowler: string;
  runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number };
  wickets?: CsWicket[];
}
interface CsInnings {
  team: string;
  overs: { over: number; deliveries: CsDelivery[] }[];
  super_over?: boolean;
}
export interface CsMatch {
  info: {
    dates: string[];
    teams: string[];
    gender: string;
    match_type: string;
    venue?: string;
    city?: string;
    event?: { name?: string };
    toss?: { winner?: string; decision?: string };
    outcome?: { winner?: string };
    players: Record<string, string[]>;
    registry: { people: Record<string, string> };
  };
  innings: CsInnings[];
}

// ---- What we produce ----
export type Phase = "powerplay" | "middle" | "death";
export const PHASES: Phase[] = ["powerplay", "middle", "death"];

export interface PhaseBat {
  balls: number;
  runs: number;
  dismissals: number;
}
export interface PhaseBowl {
  balls: number;
  runs: number;
  wickets: number;
}
export interface ParsedLine {
  cricsheetId: string;
  name: string;
  team: string;
  // PlayerMatchStats without the role: Cricsheet has no roles, they come from the players table.
  stats: Omit<PlayerMatchStats, "role">;
  phases: { bat: Record<Phase, PhaseBat>; bowl: Record<Phase, PhaseBowl> };
}
export interface ParsedMatch {
  date: string;
  teams: [string, string];
  gender: string;
  matchType: string;
  venue: string | null;
  city: string | null;
  event: string | null;
  tossWinner: string | null;
  tossDecision: "bat" | "field" | null;
  winner: string | null;
  lines: ParsedLine[];
}

// Wicket kinds that count for the bowler. Run outs and retirements do not.
const BOWLER_WICKET_KINDS = new Set(["bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket"]);
const NOT_DISMISSALS = new Set(["retired hurt", "retired not out"]);

const zeroBat = (): Record<Phase, PhaseBat> => ({
  powerplay: { balls: 0, runs: 0, dismissals: 0 },
  middle: { balls: 0, runs: 0, dismissals: 0 },
  death: { balls: 0, runs: 0, dismissals: 0 },
});
const zeroBowl = (): Record<Phase, PhaseBowl> => ({
  powerplay: { balls: 0, runs: 0, wickets: 0 },
  middle: { balls: 0, runs: 0, wickets: 0 },
  death: { balls: 0, runs: 0, wickets: 0 },
});

// Over numbers in Cricsheet start at 0.
export function phaseOfOver(over: number): Phase {
  if (over < 6) return "powerplay";
  if (over < 16) return "middle";
  return "death";
}

export function parseMatch(m: CsMatch): ParsedMatch {
  const { info } = m;
  const ids = info.registry.people;
  const lines = new Map<string, ParsedLine>();

  const ensureLine = (name: string, team: string): ParsedLine | undefined => {
    const existing = lines.get(name);
    if (existing) return existing;
    const id = ids[name];
    if (!id) return undefined;
    const line: ParsedLine = {
      cricsheetId: id,
      name,
      team,
      stats: { inPlayingXI: true, batting: [], bowling: [], fielding: [] },
      phases: { bat: zeroBat(), bowl: zeroBowl() },
    };
    lines.set(name, line);
    return line;
  };

  for (const [team, names] of Object.entries(info.players)) {
    for (const name of names) ensureLine(name, team);
  }

  for (const innings of m.innings) {
    const superOver = innings.super_over === true;
    const battingTeam = innings.team;
    const fieldingTeam = info.teams.find((t) => t !== battingTeam) ?? battingTeam;

    const bat = new Map<string, BattingInnings>();
    const bowl = new Map<string, BowlingSpell>();
    const field = new Map<string, FieldingEvents>();

    const batRow = (name: string) => {
      let r = bat.get(name);
      if (!r) bat.set(name, (r = { runs: 0, balls: 0, fours: 0, sixes: 0, dismissed: false }));
      return r;
    };
    const bowlRow = (name: string) => {
      let r = bowl.get(name);
      if (!r) bowl.set(name, (r = { balls: 0, runsConceded: 0, wickets: 0, bowledOrLbw: 0, maidens: 0 }));
      return r;
    };
    const fieldRow = (name: string) => {
      let r = field.get(name);
      if (!r) field.set(name, (r = { catches: 0, stumpings: 0, runOutsDirect: 0, runOutsShared: 0 }));
      return r;
    };

    for (const over of innings.overs) {
      const phase = phaseOfOver(over.over);
      let legalInOver = 0;
      let chargedInOver = 0;
      const bowlersInOver = new Set<string>();

      for (const d of over.deliveries) {
        const wide = (d.extras?.wides ?? 0) > 0;
        const noBall = (d.extras?.noballs ?? 0) > 0;
        const legal = !wide && !noBall;
        // Byes, leg-byes and penalty runs are not the bowler's fault.
        const charged = d.runs.total - (d.extras?.byes ?? 0) - (d.extras?.legbyes ?? 0) - (d.extras?.penalty ?? 0);

        // Batter
        const b = batRow(d.batter);
        if (!wide) b.balls += 1;
        b.runs += d.runs.batter;
        if (d.runs.batter === 4 && !d.runs.non_boundary) b.fours += 1;
        if (d.runs.batter === 6) b.sixes += 1;

        // Bowler
        const w = bowlRow(d.bowler);
        w.runsConceded += charged;
        if (legal) w.balls += 1;
        bowlersInOver.add(d.bowler);
        if (legal) legalInOver += 1;
        chargedInOver += charged;

        // Phases (the Super Over is not part of any phase)
        const bLine = ensureLine(d.batter, battingTeam);
        const wLine = ensureLine(d.bowler, fieldingTeam);
        if (!superOver) {
          if (bLine) {
            if (!wide) bLine.phases.bat[phase].balls += 1;
            bLine.phases.bat[phase].runs += d.runs.batter;
          }
          if (wLine) {
            if (legal) wLine.phases.bowl[phase].balls += 1;
            wLine.phases.bowl[phase].runs += charged;
          }
        }

        // Wickets and fielding
        for (const wk of d.wickets ?? []) {
          if (!NOT_DISMISSALS.has(wk.kind)) {
            batRow(wk.player_out).dismissed = true;
            if (!superOver) {
              const out = ensureLine(wk.player_out, battingTeam);
              if (out) out.phases.bat[phase].dismissals += 1;
            }
          }
          if (BOWLER_WICKET_KINDS.has(wk.kind)) {
            w.wickets += 1;
            if (wk.kind === "bowled" || wk.kind === "lbw") w.bowledOrLbw += 1;
            if (!superOver && wLine) wLine.phases.bowl[phase].wickets += 1;
          }
          const fielders = (wk.fielders ?? []).filter((f) => f.name && !f.substitute).map((f) => f.name as string);
          if (wk.kind === "caught" || wk.kind === "caught and bowled") {
            if (fielders[0]) fieldRow(fielders[0]).catches += 1;
          } else if (wk.kind === "stumped") {
            if (fielders[0]) fieldRow(fielders[0]).stumpings += 1;
          } else if (wk.kind === "run out") {
            if (fielders.length === 1) fieldRow(fielders[0]).runOutsDirect += 1;
            else for (const f of fielders) fieldRow(f).runOutsShared += 1;
          }
        }
      }

      // A maiden: one bowler, six legal balls, nothing charged to him.
      if (bowlersInOver.size === 1 && legalInOver >= 6 && chargedInOver === 0) {
        bowlRow([...bowlersInOver][0]).maidens += 1;
      }
    }

    const tag = superOver ? { superOver: true as const } : {};
    for (const [name, row] of bat) {
      const line = ensureLine(name, battingTeam);
      if (line) line.stats.batting!.push({ ...row, ...tag });
    }
    for (const [name, row] of bowl) {
      const line = ensureLine(name, fieldingTeam);
      if (line) line.stats.bowling!.push({ ...row, ...tag });
    }
    for (const [name, row] of field) {
      const line = lines.get(name); // substitutes who are not in the match lists are skipped
      if (line) line.stats.fielding!.push({ ...row, ...tag });
    }
  }

  const decision = info.toss?.decision;
  return {
    date: info.dates[0],
    teams: [info.teams[0], info.teams[1]],
    gender: info.gender,
    matchType: info.match_type,
    venue: info.venue ?? null,
    city: info.city ?? null,
    event: info.event?.name ?? null,
    tossWinner: info.toss?.winner ?? null,
    tossDecision: decision === "bat" || decision === "field" ? decision : null,
    winner: info.outcome?.winner ?? null,
    lines: [...lines.values()],
  };
}
