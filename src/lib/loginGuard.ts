// Slows down guessing of the PIN. A 4-digit PIN has only 10,000 possibilities, so without a limit a stranger could try
// them all. After MAX_FAILS wrong tries from one address, that address must wait WINDOW_MS. Pure logic, so it is tested;
// the route stores the small record in the app_settings table.

export const MAX_FAILS = 5;
export const WINDOW_MS = 15 * 60_000;

export interface Attempts {
  fails: number;
  first: number; // time of the first failure in the current window (ms)
}

// Is this address locked right now, and for how many more minutes?
export function lockStatus(entry: Attempts | null, now: number): { locked: boolean; minutesLeft: number } {
  if (!entry || now - entry.first >= WINDOW_MS) return { locked: false, minutesLeft: 0 };
  if (entry.fails < MAX_FAILS) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.max(1, Math.ceil((entry.first + WINDOW_MS - now) / 60_000)) };
}

// The record after one more wrong PIN. An old window is forgotten and starts again.
export function afterFailure(entry: Attempts | null, now: number): Attempts {
  if (!entry || now - entry.first >= WINDOW_MS) return { fails: 1, first: now };
  return { fails: entry.fails + 1, first: entry.first };
}

export function parseAttempts(raw: string | null | undefined): Attempts | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Attempts>;
    return typeof v.fails === "number" && typeof v.first === "number" ? { fails: v.fails, first: v.first } : null;
  } catch {
    return null;
  }
}

// The address the request came from, as Vercel reports it. Never trusted for anything except slowing guessing.
export function clientKey(forwardedFor: string | null): string {
  const first = (forwardedFor ?? "").split(",")[0].trim();
  return `login:${first || "unknown"}`.slice(0, 80);
}
