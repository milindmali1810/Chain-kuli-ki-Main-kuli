// The learning loop from the terminal: compare predicted with actual points, find consistent errors by role,
// and store PROPOSED corrections for Aryan to accept or reject on the Learning screen. Nothing is applied here.
// Runs outside Vercel:  npm run calibrate

import { runCalibration } from "../src/lib/learning";

async function main() {
  const { metrics, proposals, versionId } = await runCalibration();
  console.log(`Rubric version in force: #${versionId}`);
  console.log(`Compared ${metrics.n} players across ${metrics.matches} matches (confirmed-XI teams only).`);
  if (metrics.overall) {
    const o = metrics.overall;
    console.log(`Overall: predicted ${o.meanPredicted.toFixed(1)}, actual ${o.meanActual.toFixed(1)}, bias ${o.bias >= 0 ? "+" : ""}${o.bias.toFixed(1)}, average error ${o.mae.toFixed(1)}`);
  }
  console.log("\nBy role:");
  for (const [role, s] of Object.entries(metrics.byRole)) {
    console.log(`  ${role.padEnd(5)} n=${String(s.n).padStart(3)}  predicted ${s.meanPredicted.toFixed(1).padStart(5)}  actual ${s.meanActual.toFixed(1).padStart(5)}  bias ${(s.bias >= 0 ? "+" : "") + s.bias.toFixed(1)}  error ${s.mae.toFixed(1)}`);
  }
  console.log("\nBy pitch type:");
  for (const [tag, s] of Object.entries(metrics.byPitch)) {
    console.log(`  ${tag.padEnd(13)} n=${String(s.n).padStart(3)}  bias ${(s.bias >= 0 ? "+" : "") + s.bias.toFixed(1)}  error ${s.mae.toFixed(1)}`);
  }
  if (metrics.captainRegret.mean !== null) console.log(`\nCaptain regret: ${metrics.captainRegret.mean.toFixed(1)} points on average over ${metrics.captainRegret.n} matches.`);
  console.log(proposals.length ? `\n${proposals.length} proposal(s) stored as pending:` : "\nNo proposals: not enough evidence, or no consistent error.");
  for (const p of proposals) console.log(`  - ${p.plainEnglish} (factor ${p.oldValue} -> ${p.newValue})`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
