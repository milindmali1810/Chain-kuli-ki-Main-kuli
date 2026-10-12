// Writes docs/components-map.svg: both flows of the components map stacked in one standalone picture, for reports and slides.
// Runs outside Vercel:  npm run gen:map-svg

import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapDiagram } from "../src/components/MapDiagram";
import { AFTER_MATCH, BEFORE_MATCH, layoutFlow } from "../src/lib/mapDiagram";

const flows = [BEFORE_MATCH, AFTER_MATCH];
const W = Math.max(...flows.map((f) => layoutFlow(f).width));
const TITLE_H = 70;
const GAP = 28;
let y = 24;
const parts: string[] = [];
flows.forEach((flow, i) => {
  const p = layoutFlow(flow);
  const svg = renderToStaticMarkup(createElement(MapDiagram, { flow, id: `flow${i}`, standalone: true }));
  parts.push(
    `<text x="24" y="${y + 24}" font-size="22" font-weight="700" class="md-text">${flow.title}</text>`,
    `<text x="24" y="${y + 46}" font-size="13.5" class="md-text md-muted">${flow.subtitle}</text>`,
  );
  // Nest the drawing (an <svg> inside an <svg> keeps its own viewBox, styles and arrow marker).
  parts.push(svg.replace("<svg ", `<svg x="12" y="${y + TITLE_H}" `));
  y += TITLE_H + p.height + GAP;
});

const out =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 24} ${y}" width="${W + 24}" height="${y}" role="img" aria-label="Match Day Optimizer components map: before the match and after the match">\n` +
  `<style>.md-text{fill:#1c2a40;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}.md-muted{fill:#52627a}.bg{fill:#f7f4ec}` +
  `@media (prefers-color-scheme: dark){.md-text{fill:#e6edf7}.md-muted{fill:#a9b8cf}.bg{fill:#121b2b}}</style>\n` +
  `<rect class="bg" width="100%" height="100%"/>\n${parts.join("\n")}\n</svg>\n`;

writeFileSync("docs/components-map.svg", out);
console.log(`Wrote docs/components-map.svg (${Math.round(out.length / 1024)} KB, ${W + 24} x ${y})`);
