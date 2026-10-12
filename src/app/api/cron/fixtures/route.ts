import { serverDb } from "@/lib/db";
import { syncFixtures } from "@/lib/fixtureSync";

export const maxDuration = 120; // building a team reads the history and calls Gemini

// Run once a day by Vercel's scheduler (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// Nobody else can call it: without the secret it answers 401, and without CRON_SECRET set at all it refuses everyone.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const report = await syncFixtures(serverDb(), { apiKey: process.env.CRICAPI_KEY, budgetMs: 100_000 });
  return Response.json(report);
}
