"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

export interface SaveState {
  ok: boolean;
  message: string;
  errors: Record<string, string>; // player id -> message
  values?: Record<string, string>; // what was typed, so a failed save does not wipe the boxes
}

// Aryan types the real Dream11 points for each player. They are stored beside the predicted points
// (source = dream11_manual) and win over the points computed from the scorecard.
export async function saveActualPoints(_prev: SaveState, formData: FormData): Promise<SaveState> {
  // Server Actions can be called directly, so check the PIN here as well as in the proxy.
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!(await isValidToken(token, process.env.APP_PIN))) {
    return { ok: false, message: "Your session has ended. Enter the PIN again.", errors: {} };
  }

  const cricsheetId = String(formData.get("match") ?? "");
  const db = serverDb();
  const { data: match } = await db.from("matches").select("id").eq("cricsheet_match_id", cricsheetId).maybeSingle();
  if (!match) return { ok: false, message: "That match was not found.", errors: {} };

  // Only players who are actually in this match's recommendations can be saved (never trust the form).
  const { data: recs } = await db.from("recommendations").select("id").eq("match_id", match.id);
  const { data: allowed } = await db
    .from("recommendation_players")
    .select("player_id")
    .in("recommendation_id", (recs ?? []).map((r) => r.id));
  const allowedIds = new Set((allowed ?? []).map((a) => String(a.player_id)));

  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  const rows: { match_id: number; player_id: number; points: number; entered_by: string; source: string }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("pts_")) continue;
    const playerId = key.slice(4);
    if (!allowedIds.has(playerId)) continue;
    const text = String(raw).trim();
    values[playerId] = text;
    if (text === "") continue; // blank = leave this player as it is
    // Only save what Aryan actually changed. Unchanged boxes still hold the pre-filled scorecard number, which
    // must not be relabelled as a real Dream11 value.
    const original = String(formData.get(`orig_${playerId}`) ?? "").trim();
    if (original !== "" && Number(original) === Number(text)) continue;
    const value = Number(text);
    if (!Number.isFinite(value)) errors[playerId] = "Enter a number, like 42 or 42.5";
    else if (value < -100 || value > 1000) errors[playerId] = "That looks too large or small. Check the points.";
    else rows.push({ match_id: match.id, player_id: Number(playerId), points: Math.round(value * 10) / 10, entered_by: "Aryan", source: "dream11_manual" });
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: `${Object.keys(errors).length} value(s) need fixing. Nothing was saved.`, errors, values };
  }
  if (rows.length === 0) return { ok: false, message: "Nothing changed. Type a different value for at least one player.", errors: {}, values };

  const { error } = await db.from("actual_points").upsert(rows, { onConflict: "match_id,player_id,source" });
  if (error) return { ok: false, message: "Couldn't save. Try again in a moment.", errors: {}, values };

  revalidatePath("/");
  revalidatePath(`/matches/${cricsheetId}`);
  revalidatePath("/learning");
  return { ok: true, message: `Saved ${rows.length} player${rows.length === 1 ? "" : "s"}. These real points now count in the comparison.`, errors: {} };
}
