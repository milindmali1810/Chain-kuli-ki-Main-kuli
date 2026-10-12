// Team colours for the stripe and badges that mark a match. Purely decorative: text and buttons keep the app's own colours,
// so readability never depends on a team's colours. Plain colours, no logos (logos are trademarked).

export interface TeamColors {
  a: string; // main colour
  b: string; // second colour
  code: string; // short code for the badge
}

const T = (a: string, b: string, code: string): TeamColors => ({ a, b, code });

// Jersey-style colours for the sides we cover. Anything not listed gets a steady colour made from its name.
const KNOWN: Record<string, TeamColors> = {
  india: T("#1565C0", "#F28A1E", "IND"),
  australia: T("#E0AE00", "#0B6B3A", "AUS"),
  england: T("#1F3A6E", "#C8102E", "ENG"),
  pakistan: T("#0B5D2A", "#5FB878", "PAK"),
  "sri lanka": T("#1B3A8C", "#F2B705", "SL"),
  bangladesh: T("#006A4E", "#E22B3A", "BAN"),
  "south africa": T("#0A7A4B", "#F2B705", "SA"),
  "new zealand": T("#1F2430", "#9AA5B1", "NZ"),
  "west indies": T("#7B1E3A", "#F2C318", "WI"),
  afghanistan: T("#C8102E", "#1B7F3B", "AFG"),
  zimbabwe: T("#2E7D32", "#F2C318", "ZIM"),
  ireland: T("#169B62", "#FF883E", "IRE"),
  scotland: T("#1E4DA8", "#7FB2F0", "SCO"),
  netherlands: T("#F36C21", "#1F3A6E", "NED"),
  nepal: T("#C8102E", "#1E4DA8", "NEP"),
  "united arab emirates": T("#C8102E", "#1B7F3B", "UAE"),
  oman: T("#C8102E", "#1B7F3B", "OMA"),
  "united states of america": T("#1F3A6E", "#C8102E", "USA"),
  canada: T("#C8102E", "#6B6B6B", "CAN"),
  namibia: T("#1E4DA8", "#C8102E", "NAM"),
  "hong kong": T("#C8102E", "#6B6B6B", "HK"),
  malaysia: T("#F2C318", "#C8102E", "MAS"),
  singapore: T("#C8102E", "#6B6B6B", "SIN"),
  japan: T("#C8102E", "#6B6B6B", "JPN"),
  // IPL
  "chennai super kings": T("#F2C318", "#1F3A6E", "CSK"),
  "mumbai indians": T("#1565C0", "#D4AF37", "MI"),
  "royal challengers bengaluru": T("#C8102E", "#1F1F1F", "RCB"),
  "royal challengers bangalore": T("#C8102E", "#1F1F1F", "RCB"),
  "kolkata knight riders": T("#4B2E83", "#D4AF37", "KKR"),
  "delhi capitals": T("#1565C0", "#C8102E", "DC"),
  "sunrisers hyderabad": T("#F26522", "#1F1F1F", "SRH"),
  "rajasthan royals": T("#E91E8C", "#1F3A6E", "RR"),
  "punjab kings": T("#C8102E", "#BFC5CC", "PBKS"),
  "gujarat titans": T("#1F2A44", "#B08D57", "GT"),
  "lucknow super giants": T("#00A3E0", "#F36C21", "LSG"),
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// A short code: the known one, the initials of a multi-word name (up to 3 letters), or the first three letters.
function codeFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  return name.trim().slice(0, 3).toUpperCase();
}

export function teamColors(name: string): TeamColors {
  const known = KNOWN[norm(name)];
  if (known) return known;
  // Steady and calm for teams we have not listed (for example the Syed Mushtaq Ali state sides): the same name always
  // gives the same colours.
  const h = hash(norm(name)) % 360;
  return { a: hsl(h, 52, 38), b: hsl((h + 40) % 360, 52, 52), code: codeFor(name) };
}

// ---------- Readable letters on a coloured badge ----------

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// White or near-black, whichever reads better on the badge colour.
export function textOn(bg: string): string {
  return contrast("#ffffff", bg) >= contrast("#111827", bg) ? "#ffffff" : "#111827";
}

// The badge background and its letters. If neither white nor near-black reads well on a side's colour (bright pinks, mid
// greys), the colour is darkened just enough that white letters pass 4.5 to 1. The stripe keeps the true colour.
export function badgeStyle(hex: string): { bg: string; fg: string } {
  let bg = hex;
  for (let i = 0; i < 12 && contrast(textOn(bg), bg) < 4.5; i++) {
    const c = [1, 3, 5].map((k) => Math.round(parseInt(bg.slice(k, k + 2), 16) * 0.9));
    bg = `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return { bg, fg: textOn(bg) };
}

// CSS variables for a match's stripe: the left (or top) half is the first side's main colour, the other half the second's.
export function matchVars(teamA: string, teamB: string): Record<string, string> {
  return { "--ta": teamColors(teamA).a, "--tb": teamColors(teamB).a };
}
