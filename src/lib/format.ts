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
