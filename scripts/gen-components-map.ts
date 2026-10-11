// Writes docs/COMPONENTS_MAP.md from src/lib/componentsMap.ts, so the document and the in-app page can never disagree.
// Run:  npm run gen:map

import { writeFileSync } from "node:fs";
import { ACTORS, COLUMNS } from "../src/lib/componentsMap";

const esc = (s: string) => s.replace(/\|/g, "/");
const head = `| Actor | ${COLUMNS.join(" | ")} |`;
const sep = `|${Array(COLUMNS.length + 1).fill("---").join("|")}|`;
const rows = ACTORS.map((a) => `| **${a.name}** (${a.kind}) | ${COLUMNS.map((c) => esc(a.cells[c])).join(" | ")} |`);

const md = [
  "# Components map",
  "",
  "Swimlane grid required by the exam booklet: actors as rows; Trigger, Input, Context, Processing, AI and Output as columns.",
  "Generated from `src/lib/componentsMap.ts` (run `npm run gen:map`), which also feeds the in-app page at `/guide/map`.",
  "",
  "The one rule: code picks, validates and scores; Gemini Flash only writes explanation text from numbers the code produced.",
  "",
  head,
  sep,
  ...rows,
  "",
].join("\n");

writeFileSync("docs/COMPONENTS_MAP.md", md);
console.log(`Wrote docs/COMPONENTS_MAP.md (${ACTORS.length} actors, ${COLUMNS.length} columns)`);
