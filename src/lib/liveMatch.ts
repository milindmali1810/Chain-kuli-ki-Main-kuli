// Pure checks for "add an upcoming match". No database here, so it is easy to test.

// Aryan types the start time as shown on Dream11, which is Indian time. Stored as UTC (IST is UTC+5:30, no daylight saving).
// Returns an ISO UTC string, or null if the text is not a real date and time.
export function istToUtcIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - (5 * 60 + 30) * 60_000;
  const date = new Date(ms);
  // Reject dates that rolled over, like 31 February.
  const back = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return date.toISOString();
}

export interface NewMatchInput {
  teamA: string;
  teamB: string;
  venue: string;
  startLocal: string;
}

export interface NewMatchCheck {
  ok: boolean;
  errors: Partial<Record<keyof NewMatchInput, string>>;
  startUtc: string | null;
}

export function checkNewMatch(input: NewMatchInput, now: Date = new Date()): NewMatchCheck {
  const errors: NewMatchCheck["errors"] = {};
  if (!input.teamA.trim()) errors.teamA = "Choose the first team.";
  if (!input.teamB.trim()) errors.teamB = "Choose the second team.";
  if (input.teamA.trim() && input.teamA.trim() === input.teamB.trim()) errors.teamB = "The two teams must be different.";
  if (!input.venue.trim()) errors.venue = "Choose the venue.";
  const startUtc = istToUtcIso(input.startLocal);
  if (!startUtc) errors.startLocal = "Enter the date and time as shown on Dream11.";
  else if (new Date(startUtc).getTime() <= now.getTime()) errors.startLocal = "That time has already passed. This screen is for matches that have not started.";
  return { ok: Object.keys(errors).length === 0, errors, startUtc };
}
