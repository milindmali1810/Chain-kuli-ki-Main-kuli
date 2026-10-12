// Writes the "why" for a stored recommendation. Gemini Flash writes sentences from numbers the engine already
// produced; plain code rejects any sentence with a number that is not in those facts (see src/lib/reasoning.ts).
// The work itself lives in src/lib/explainMatch.ts (shared with the app's "Pick my team" button).
// Runs outside Vercel:  npm run explain -- --match 1529230 [--no-gemini]
//   --no-gemini   skip the API call and use the plain templates (also what happens if Gemini fails)

import { serverDb } from "../src/lib/db";
import { explainMatch } from "../src/lib/explainMatch";

const args = process.argv.slice(2);
const i = args.indexOf("--match");
const cricsheetId = i >= 0 ? args[i + 1] : undefined;
if (!cricsheetId) throw new Error("Usage: npm run explain -- --match <cricsheet match id> [--no-gemini]");

async function main() {
  const r = await explainMatch(serverDb(), cricsheetId!, {
    useGemini: !args.includes("--no-gemini"),
    apiKey: process.env.GEMINI_API_KEY,
    log: (line) => console.log(line),
  });
  console.log(`\nGemini calls: ${r.geminiCalls} (failures ${r.geminiFailures}). Sentences accepted: ${r.accepted}. Replaced by template: ${r.replaced}.`);
  if (r.rejections.length) console.log("Rejected by the guard:\n  " + r.rejections.join("\n  "));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
