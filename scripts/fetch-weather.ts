// Fetches weather for one match and saves it in match_context.
// Runs outside Vercel:  npm run fetch:weather -- --match 1529230
//   --match  the Cricsheet match id (as stored in matches.cricsheet_match_id)

import { createClient } from "@supabase/supabase-js";
import { fetchMatchWeather } from "../src/lib/weather";

const args = process.argv.slice(2);
const i = args.indexOf("--match");
const cricsheetId = i >= 0 ? args[i + 1] : undefined;
if (!cricsheetId) throw new Error("Usage: npm run fetch:weather -- --match <cricsheet match id>");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase settings in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: match, error } = await db
    .from("matches")
    .select("id, start_time, venues(name, city)")
    .eq("cricsheet_match_id", cricsheetId)
    .single();
  if (error) throw new Error(`match ${cricsheetId}: ${error.message}`);

  const venue = match.venues as unknown as { name: string; city: string | null } | null;
  const place = venue?.city ?? venue?.name;
  if (!place) throw new Error("This match has no venue, so there is nowhere to look up weather for");

  const date = String(match.start_time).slice(0, 10);
  console.log(`Weather for ${place} on ${date} ...`);
  const weather = await fetchMatchWeather(place, date);

  const { error: saveErr } = await db
    .from("match_context")
    .upsert({ match_id: match.id, weather_json: weather, fetched_at: new Date().toISOString() }, { onConflict: "match_id" });
  if (saveErr) throw new Error(`saving weather: ${saveErr.message}`);

  console.log("Saved:", JSON.stringify(weather.summary));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
