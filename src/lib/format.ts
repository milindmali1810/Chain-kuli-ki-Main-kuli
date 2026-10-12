// Small display helpers shared by the screens.

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

// Stadium names often already end with the city ("Ekana Cricket Stadium, Lucknow"), so only add the city if missing.
export function venueLabel(name: string | null | undefined, city: string | null | undefined): string {
  if (!name) return "Unknown venue";
  if (!city || name.toLowerCase().includes(city.toLowerCase())) return name;
  return `${name}, ${city}`;
}

export const ROLE_LABEL: Record<string, string> = { WK: "Keeper", BAT: "Batter", AR: "All-rounder", BOWL: "Bowler" };

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  return n.toFixed(digits);
}

export function pctEffect(multiplier: number): string {
  const p = Math.round((multiplier - 1) * 1000) / 10;
  return `${p > 0 ? "+" : ""}${p}%`;
}

// A start time as Aryan sees it on Dream11: Indian time, e.g. "14 Oct, 7:30 pm IST".
export function formatIst(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
  return `${day}, ${time.toLowerCase()} IST`;
}
