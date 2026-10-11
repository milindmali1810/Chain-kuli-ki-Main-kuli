"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { venueLabel } from "@/lib/format";
import { checkNewMatch } from "@/lib/liveMatch";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

export interface NewMatchState {
  message: string;
  errors: Record<string, string>;
  values: Record<string, string>;
}

// Step 1 of the live path: record an upcoming match (two teams, a venue, the exact start time). Nothing is predicted yet.
// The squad, the confirmed XI at the toss and the real Dream11 credits are added in the next steps.
export async function createUpcomingMatch(_prev: NewMatchState, formData: FormData): Promise<NewMatchState> {
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  const values = Object.fromEntries(["teamA", "teamB", "venue", "startLocal"].map((k) => [k, String(formData.get(k) ?? "").trim()]));
  if (!(await isValidToken(token, process.env.APP_PIN))) return { message: "Your session has ended. Enter the PIN again.", errors: {}, values };

  const check = checkNewMatch({ teamA: values.teamA, teamB: values.teamB, venue: values.venue, startLocal: values.startLocal });
  const errors: Record<string, string> = { ...check.errors };

  const db = serverDb();
  // Only international sides for now: the model's "predicted XI" is built from each side's last international matches.
  const { data: league } = await db.from("leagues").select("id").eq("tier", "international").eq("gender", "male").limit(1).maybeSingle();
  const { data: teams } = await db.from("teams").select("id, name").eq("league_id", league?.id ?? -1);
  const teamId = (name: string) => (teams ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase())?.id as number | undefined;
  const a = teamId(values.teamA);
  const b = teamId(values.teamB);
  if (!errors.teamA && a === undefined) errors.teamA = "That team is not in the data. Pick one from the list.";
  if (!errors.teamB && b === undefined) errors.teamB = "That team is not in the data. Pick one from the list.";

  const { data: venues } = await db.from("venues").select("id, name, city");
  const venue = (venues ?? []).find((v) => venueLabel(v.name, v.city).toLowerCase() === values.venue.toLowerCase());
  if (!errors.venue && !venue) errors.venue = "That venue is not in the data. Pick one from the list.";

  if (Object.keys(errors).length > 0) return { message: `${Object.keys(errors).length} thing(s) to fix. Nothing was saved.`, errors, values };

  const { data: row, error } = await db
    .from("matches")
    .insert({ league_id: league!.id, venue_id: venue!.id, team_a: a, team_b: b, start_time: check.startUtc, status: "scheduled", data_origin: "manual" })
    .select("id")
    .single();
  if (error || !row) return { message: "Couldn't save. Try again in a moment.", errors: {}, values };

  // The app's match links use this id, so give the new match a readable one that cannot clash with a Cricsheet number.
  const liveId = `live-${row.id}`;
  const { error: idErr } = await db.from("matches").update({ cricsheet_match_id: liveId }).eq("id", row.id);
  if (idErr) {
    await db.from("matches").delete().eq("id", row.id); // never leave a half-made match behind
    return { message: "Couldn't save. Try again in a moment.", errors: {}, values };
  }

  revalidatePath("/");
  redirect(`/matches/${liveId}`);
}
