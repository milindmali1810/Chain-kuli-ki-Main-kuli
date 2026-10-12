"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { syncFixtures } from "@/lib/fixtureSync";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

export interface FindState {
  ok: boolean;
  message: string;
}

// "Look for new matches": the same check the daily job runs, on demand.
export async function findNewMatches(): Promise<FindState> {
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!(await isValidToken(token, process.env.APP_PIN))) return { ok: false, message: "Your session has ended. Enter the PIN again." };
  const r = await syncFixtures(serverDb(), { apiKey: process.env.CRICAPI_KEY, budgetMs: 100_000 });
  revalidatePath("/");
  if (r.problem) return { ok: false, message: r.problem };
  const ready = r.prepared.filter((p) => p.note.endsWith("team ready")).length;
  const stuck = r.prepared.filter((p) => !p.note.endsWith("team ready"));
  const parts = [
    `Found ${r.found} upcoming T20 match${r.found === 1 ? "" : "es"}`,
    `${r.added} new on your list`,
    ready > 0 ? `${ready} team${ready === 1 ? "" : "s"} built` : null,
    stuck.length > 0 ? `${stuck.length} not built (${stuck[0].note})` : null,
  ].filter(Boolean);
  return { ok: true, message: `${parts.join(", ")}.` };
}
