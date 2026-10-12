// Turns docs/components-map.svg into a PNG picture (light version) for the project folder, reports and slides.
// Runs outside Vercel (after npm run gen:map-svg):  npm run gen:map-png

import { readFileSync } from "node:fs";
import sharp from "sharp";

async function main() {
  const svg = readFileSync("docs/components-map.svg");
  // density 220 makes the picture crisp (about 3 times the SVG's size) so the small labels stay readable on a slide.
  const png = await sharp(svg, { density: 220 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  await sharp(png).toFile("Component-Map.png");
  await sharp(png).toFile("docs/components-map.png");
  console.log(`Wrote Component-Map.png and docs/components-map.png (${meta.width} x ${meta.height}, ${Math.round(png.length / 1024)} KB)`);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
