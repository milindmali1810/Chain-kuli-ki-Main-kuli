// The Components Map required by the exam booklet: a swimlane grid with actors as rows and
// Trigger, Input, Context, Processing, AI and Output as columns. One source for the in-app page.

export const COLUMNS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"] as const;
export type Column = (typeof COLUMNS)[number];

export interface Actor {
  name: string;
  kind: string; // who or what this is
  cells: Record<Column, string>;
}

const NONE = "None";

export const ACTORS: Actor[] = [
  {
    name: "Aryan",
    kind: "The user",
    cells: {
      Trigger: "Opens a match, enters points, accepts or rejects a proposal",
      Input: "PIN, real Dream11 points, manual roles, accept or reject",
      Context: "Sees predicted vs actual points and the reasons on phone or laptop",
      Processing: NONE,
      AI: NONE,
      Output: "Decides which team to enter in Dream11; approves new rubric versions",
    },
  },
  {
    name: "Data jobs (run outside Vercel)",
    kind: "Scripts: ingest, roles, weather, credits",
    cells: {
      Trigger: "A command today (npm run ingest:cricsheet, fetch:weather); a scheduled job later",
      Input: "Cricsheet ball-by-ball files (T20Is, IPL, Syed Mushtaq Ali), Open-Meteo weather",
      Context: "League and competition tier, match date, no scraping inside Vercel functions",
      Processing: "Translate every ball into per-player match rows; infer roles from what players did; seed credits",
      AI: NONE,
      Output: "Rows in Supabase, each labelled ingested, computed or seeded",
    },
  },
  {
    name: "Supabase",
    kind: "Storage (Postgres)",
    cells: {
      Trigger: "Reads and writes from scripts and server code",
      Input: "24 tables: matches, players, stats, recommendations, actual points, rubric versions, audit log",
      Context: "Row Level Security on with no public access; only the server key can read or write",
      Processing: NONE,
      AI: NONE,
      Output: "History, recommendations, predicted and actual points, versions",
    },
  },
  {
    name: "Rules and points config",
    kind: "Data, not code",
    cells: {
      Trigger: "Loaded whenever a team is validated or a player is scored",
      Input: "Team rule profiles (strict, loose), points tables (standard, variant), rubric parameters",
      Context: "Every value carries its source and how sure we are (certain to unverified)",
      Processing: NONE,
      AI: NONE,
      Output: "The numbers the engine and validator read",
    },
  },
  {
    name: "Prediction and selection engine",
    kind: "Plain TypeScript",
    cells: {
      Trigger: "The backtest command (a toss-time run is the planned live trigger)",
      Input: "Only matches before the match date; predicted or confirmed XI; seeded credits; weather; venue history",
      Context: "As-of date prevents peeking; missing data stays unavailable; active rubric version",
      Processing: "Expected points (form, venue, team form, death-over rule, role correction); exact best legal team; captain and vice-captain; rules validator",
      AI: "None. The AI never picks a player or checks a rule",
      Output: "Recommended 11, captain, vice-captain, and the numbers behind every pick",
    },
  },
  {
    name: "Gemini Flash",
    kind: "AI (gemini-3.8-flash)",
    cells: {
      Trigger: "After a recommendation is stored (npm run explain)",
      Input: "A packet of numbers the engine produced for each pick and the match",
      Context: "Instructions: use only those numbers, no win predictions, no calculations of its own",
      Processing: "A code guard rejects any sentence with a number not in the facts; plain templates replace rejected ones",
      AI: "Writes the reason for each pick, the captain and vice-captain reasons, the pitch report and the team summary, as JSON",
      Output: "Reason text saved with each pick, plus an audit log of accepted and rejected sentences",
    },
  },
  {
    name: "Web app (Vercel)",
    kind: "Next.js dashboard behind a PIN",
    cells: {
      Trigger: "Aryan visits a screen or submits a form",
      Input: "Supabase, read through server code only; typed Dream11 points and role overrides",
      Context: "Every action checks the PIN itself; layout works on phone and laptop",
      Processing: "Renders matches, predicted vs actual bars and reasons; saves only the values Aryan changed",
      AI: "None at runtime. The reasons were written earlier and are only displayed",
      Output: "Matches, match view, Learning, Data and Guide screens",
    },
  },
  {
    name: "Learning loop",
    kind: "Deterministic maths plus a human decision",
    cells: {
      Trigger: "After actual points exist: the Look for patterns button or npm run calibrate",
      Input: "Predicted and actual points for every player in every final team",
      Context: "Needs about 20 compared players; a role needs enough rows of its own; one cycle moves a value by at most 20%",
      Processing: "Average error and bias by role and by pitch type; proposes a per-role correction factor",
      AI: NONE,
      Output: "Pending proposals; on acceptance a new rubric version; accuracy shown per version",
    },
  },
];
