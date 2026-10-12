// Looks for upcoming matches and builds a team for each one starting soon (the same thing the daily job does).
// Runs outside Vercel:  npm run sync:fixtures
//   --sample   pretend the feed returned one upcoming India v Australia T20I (for testing without a CricAPI key)

import { serverDb } from "../src/lib/db";
import { syncFixtures } from "../src/lib/fixtureSync";

const sample = process.argv.includes("--sample");

async function main() {
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString().slice(0, 19); // CricAPI sends GMT without the Z
  const fake = async () => ({
    status: "success",
    data: [{ id: "sample-ind-aus-1", name: "India vs Australia, SAMPLE T20I", matchType: "t20", venue: "Eden Gardens, Kolkata", dateTimeGMT: inHours(30), teams: ["India", "Australia"], matchStarted: false, matchEnded: false }],
  });
  const report = await syncFixtures(serverDb(), {
    apiKey: sample ? "sample" : process.env.CRICAPI_KEY,
    fetchImpl: sample ? fake : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
