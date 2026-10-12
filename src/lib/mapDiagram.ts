// The visual components map: actors down the side, the flow (Trigger to Output) across, one box per step, dashed arrows
// between steps. Pure data and layout (no React), so the page and the exported SVG file draw exactly the same thing.

export const FLOW_COLUMNS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"] as const;

export interface Actor {
  name: string;
  kind: string;
  tone: number; // 0 to 6, picks the box colour
}

export interface Step {
  id: string;
  actor: number; // row index
  column: number; // 0 to 5, an index into FLOW_COLUMNS
  text: string;
}

export interface Flow {
  title: string;
  subtitle: string;
  actors: Actor[];
  steps: Step[];
  edges: [string, string][]; // from step id to step id
}

// ---------- The two flows ----------

export const BEFORE_MATCH: Flow = {
  title: "Before the match",
  subtitle: "From the morning check to a team Aryan can keep or change.",
  actors: [
    { name: "Morning job", kind: "Vercel scheduler", tone: 0 },
    { name: "Fixture feed", kind: "CricAPI", tone: 1 },
    { name: "History", kind: "Cricsheet, Open-Meteo", tone: 2 },
    { name: "Engine", kind: "Plain TypeScript", tone: 3 },
    { name: "Gemini Flash", kind: "The only AI", tone: 4 },
    { name: "Web app", kind: "Vercel, PIN", tone: 5 },
    { name: "Aryan", kind: "Dream11 player", tone: 6 },
  ],
  steps: [
    { id: "a", actor: 0, column: 0, text: "Every morning, or the Look for new matches button" },
    { id: "b", actor: 1, column: 1, text: "Lists upcoming T20 matches with start time" },
    { id: "c", actor: 2, column: 2, text: "Last five XIs, form, ground, weather" },
    { id: "d", actor: 3, column: 3, text: "Predicts points, finds the best legal team" },
    { id: "e", actor: 4, column: 4, text: "Writes the reasons from the numbers" },
    { id: "f", actor: 3, column: 5, text: "Rules checker passes it, team saved" },
    { id: "g", actor: 5, column: 5, text: "Match listed with the team ready" },
    { id: "h", actor: 6, column: 5, text: "Reviews, edits, confirms" },
  ],
  edges: [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["f", "g"], ["g", "h"]],
};

export const AFTER_MATCH: Flow = {
  title: "After the match",
  subtitle: "How the agent learns from the points Aryan enters.",
  actors: [
    { name: "Aryan", kind: "Dream11 player", tone: 6 },
    { name: "Web app", kind: "Vercel, PIN", tone: 5 },
    { name: "Database", kind: "Supabase", tone: 2 },
    { name: "Learning loop", kind: "Plain maths", tone: 3 },
    { name: "Engine", kind: "Plain TypeScript", tone: 1 },
  ],
  steps: [
    { id: "a", actor: 0, column: 0, text: "Types the points his team scored" },
    { id: "b", actor: 1, column: 1, text: "Saves only the boxes he changed" },
    { id: "c", actor: 2, column: 2, text: "Predicted vs actual for every player" },
    { id: "d", actor: 3, column: 3, text: "Finds where it is consistently wrong" },
    { id: "e", actor: 3, column: 5, text: "Small correction, saved as a new version" },
    { id: "f", actor: 1, column: 5, text: "Learning screen shows it, with Undo" },
    { id: "g", actor: 4, column: 5, text: "The next match uses the new version" },
  ],
  edges: [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "f"], ["e", "g"]],
};

// ---------- Layout ----------

export const LAYOUT = {
  labelW: 150, // actor names on the left
  colW: 168,
  rowH: 86,
  headH: 44,
  boxW: 144,
  boxH: 58,
  pad: 12,
  lineChars: 19, // roughly how many characters fit on one line of a box
} as const;

export interface PlacedStep extends Step {
  x: number; y: number; w: number; h: number; lines: string[]; tone: number;
}

export interface PlacedEdge {
  from: string; to: string;
  d: string; // SVG path
}

export interface PlacedFlow {
  width: number; height: number;
  steps: PlacedStep[]; edges: PlacedEdge[];
  headers: { x: number; label: string }[];
  rows: { y: number; actor: Actor }[];
}

// Break a sentence into short lines that fit a box (words are never split).
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (cur && (cur + " " + word).length > maxChars) { lines.push(cur); cur = word; }
    else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function layoutFlow(flow: Flow): PlacedFlow {
  const L = LAYOUT;
  const width = L.labelW + FLOW_COLUMNS.length * L.colW + L.pad;
  const height = L.headH + flow.actors.length * L.rowH + L.pad;
  const placed: PlacedStep[] = flow.steps.map((s) => ({
    ...s,
    w: L.boxW, h: L.boxH,
    x: L.labelW + s.column * L.colW + (L.colW - L.boxW) / 2,
    y: L.headH + s.actor * L.rowH + (L.rowH - L.boxH) / 2,
    lines: wrapText(s.text, L.lineChars),
    tone: flow.actors[s.actor].tone,
  }));
  const byId = new Map(placed.map((p) => [p.id, p]));
  const edges: PlacedEdge[] = flow.edges.map(([from, to]) => {
    const a = byId.get(from)!, b = byId.get(to)!;
    let d: string;
    if (a.column === b.column) {
      // Straight down or up between two boxes in the same column.
      const x = a.x + a.w / 2;
      d = b.y > a.y ? `M ${x} ${a.y + a.h} V ${b.y - 3}` : `M ${x} ${a.y} V ${b.y + b.h + 3}`;
    } else {
      // Out of the right side, along, then down (or up) into the next box. Same row: straight across to its left edge.
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w / 2;
      if (b.y === a.y) d = `M ${x1} ${y1} H ${b.x - 3}`;
      else if (b.y > a.y) d = `M ${x1} ${y1} H ${x2} V ${b.y - 3}`;
      // Coming up into a box from below, arrive a little left of centre so it never overlaps the arrow leaving that box downward.
      else d = `M ${x1} ${y1} H ${x2 - 28} V ${b.y + b.h + 3}`;
    }
    return { from, to, d };
  });
  return {
    width, height, steps: placed, edges,
    headers: FLOW_COLUMNS.map((label, i) => ({ label, x: L.labelW + i * L.colW + L.colW / 2 })),
    rows: flow.actors.map((actor, i) => ({ actor, y: L.headH + i * L.rowH })),
  };
}
