// What a match needs from Aryan next. One place decides it, so the home list, the next-match card and the match page
// all say the same thing. Pure and tested.

export type StateKey = "no-team" | "review" | "confirmed" | "started" | "played";

export interface MatchStateInput {
  live: boolean; // an upcoming-type match (found by the agent or added by hand), not a backtest
  startUtc?: string;
  hasTeam: boolean; // the agent has built a team
  confirmed: boolean; // Aryan confirmed his own team
  hasActual: boolean; // points are on file
}

export interface MatchState {
  key: StateKey;
  label: string; // status for a chip on the match page and the next-match card
  short: string; // one or two words for a row in a list
  action: string; // the one thing to do, for a button
  tone: "info" | "good" | "warn" | "plain";
  step: 1 | 2 | 3; // which of the three steps is current: 1 review, 2 confirm, 3 enter points
}

export function matchState(i: MatchStateInput, now: Date): MatchState {
  if (!i.live || i.hasActual) {
    return { key: "played", label: "Played", short: "Played", action: "See how it went", tone: "good", step: 3 };
  }
  const started = i.startUtc ? new Date(i.startUtc).getTime() <= now.getTime() : false;
  if (started) {
    return i.hasTeam
      ? { key: "started", label: "Started: enter your points after the match", short: "Started", action: "Enter your points", tone: "warn", step: 3 }
      : { key: "started", label: "Started", short: "Started", action: "Open", tone: "plain", step: 3 };
  }
  if (!i.hasTeam) return { key: "no-team", label: "Team builds about 3 days before", short: "Not built yet", action: "Build the team now", tone: "plain", step: 1 };
  if (i.confirmed) return { key: "confirmed", label: "You confirmed your team", short: "Confirmed", action: "Open my team", tone: "good", step: 2 };
  return { key: "review", label: "Team ready: review it", short: "Team ready", action: "Review the team", tone: "info", step: 1 };
}

// "in 5 h", "in 40 min", "in 3 days", or "started".
export function relativeStart(startIso: string, now: Date): string {
  const ms = new Date(startIso).getTime() - now.getTime();
  if (ms <= 0) return "started";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.floor(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); // 2026-10-14

// "Today", "Tomorrow", or "Sat 17 Oct", counted in Indian time (how Aryan reads the Dream11 app).
export function dayLabel(startIso: string, now: Date): string {
  const start = new Date(startIso);
  const days = Math.round((Date.parse(istDate(start)) - Date.parse(istDate(now))) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(start).replace(",", "");
}
