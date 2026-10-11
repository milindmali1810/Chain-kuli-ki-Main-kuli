"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { loadEditorData } from "@/lib/editor";
import { learnAfterPoints } from "@/lib/learning";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

export interface SaveState {
  ok: boolean;
  message: string;
  errors: Record<string, string>; // player id (or "total") -> message
  values?: Record<string, string>; // what was typed, so a failed save does not wipe the boxes
}

// After the match Aryan records what HIS team scored in Dream11: the points for each of his players and the team
// total Dream11 shows. Real Dream11 values are stored as source dream11_manual; points calculated from the scorecard
// stay labelled computed_from_scorecard. Nothing the browser sends is trusted.
export async function saveActualPoints(_prev: SaveState, formData: FormData): Promise<SaveState> {
  // Server Actions can be called directly, so check the PIN here as well as in the proxy.
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!(await isValidToken(token, process.env.APP_PIN))) {
    return { ok: false, message: "Your session has ended. Enter the PIN again.", errors: {} };
  }

  const cricsheetId = String(formData.get("match") ?? "");
  const data = await loadEditorData(cricsheetId);
  if (!data) return { ok: false, message: "That match was not found.", errors: {} };
  const db = serverDb();

  // The team Aryan actually played: his confirmed team, or the agent's team if he never edited it.
  const teamIds = data.saved?.ids ?? data.agent?.ids ?? [];
  const allowedIds = new Set(teamIds.map(String));

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
    // Only save what Aryan actually changed. Unchanged boxes still hold the pre-filled number, which must not be
    // relabelled as a real Dream11 value.
    const original = String(formData.get(`orig_${playerId}`) ?? "").trim();
    if (original !== "" && Number(original) === Number(text)) continue;
    const value = Number(text);
    if (!Number.isFinite(value)) errors[playerId] = "Enter a number, like 42 or 42.5";
    else if (value < -100 || value > 1000) errors[playerId] = "That looks too large or small. Check the points.";
    else rows.push({ match_id: data.matchId, player_id: Number(playerId), points: Math.round(value * 10) / 10, entered_by: "Aryan", source: "dream11_manual" });
  }

  // The team total as Dream11 shows it (with the captain and vice-captain extras already added).
  let reportedTotal: number | null = null;
  const totalText = String(formData.get("total") ?? "").trim();
  values.total = totalText;
  const originalTotal = String(formData.get("orig_total") ?? "").trim();
  if (totalText !== "" && !(originalTotal !== "" && Number(originalTotal) === Number(totalText))) {
    const t = Number(totalText);
    if (!Number.isFinite(t)) errors.total = "Enter a number, like 436 or 436.5";
    else if (t < -1000 || t > 10000) errors.total = "That total looks wrong. Check the Dream11 screen.";
    else reportedTotal = Math.round(t * 10) / 10;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: `${Object.keys(errors).length} value(s) need fixing. Nothing was saved.`, errors, values };
  }
  if (rows.length === 0 && reportedTotal === null) {
    return { ok: false, message: "Nothing changed. Type a different value for at least one player, or the Dream11 team total.", errors: {}, values };
  }

  if (rows.length > 0) {
    const { error } = await db.from("actual_points").upsert(rows, { onConflict: "match_id,player_id,source" });
    if (error) return { ok: false, message: "Couldn't save. Try again in a moment.", errors: {}, values };
  }

  // Keep the scorecard calculation for his players on file too, honestly labelled as computed, so the team total can
  // always be worked out.
  const computedRows = teamIds
    .filter((id) => data.computedById[id] !== undefined)
    .map((id) => ({ match_id: data.matchId, player_id: id, points: data.computedById[id], entered_by: "scorecard", source: "computed_from_scorecard" }));
  if (computedRows.length > 0) await db.from("actual_points").upsert(computedRows, { onConflict: "match_id,player_id,source" });

  // Record the Dream11 team total against his team. If he never edited the agent's team, his entry means he played it,
  // so it becomes his team (marked unedited).
  if (reportedTotal !== null) {
    const { data: existing } = await db.from("user_teams").select("players_json").eq("match_id", data.matchId).maybeSingle();
    if (existing) {
      await db.from("user_teams").update({ players_json: { ...(existing.players_json as object), reportedTotal } }).eq("match_id", data.matchId);
    } else if (data.agent) {
      await db.from("user_teams").insert({
        match_id: data.matchId,
        players_json: { ids: data.agent.ids, agentStage: data.agent.stage, unedited: true, reportedTotal },
        captain_id: data.agent.captainId,
        vc_id: data.agent.viceId,
        confirmed_at: new Date().toISOString(),
      });
    }
  }

  revalidatePath("/");
  revalidatePath(`/matches/${cricsheetId}`);
  revalidatePath("/learning");
  const parts = [rows.length ? `${rows.length} player${rows.length === 1 ? "" : "s"}` : null, reportedTotal !== null ? "the Dream11 team total" : null].filter(Boolean);

  // The learning loop: the agent re-checks how wrong it was and (in automatic mode) updates itself for the next match.
  // A problem here must never undo or hide a successful save.
  let learned = "";
  try {
    const outcome = await learnAfterPoints(`match ${cricsheetId}`, db);
    learned = ` ${outcome.message}`;
    revalidatePath("/learning");
  } catch {
    learned = " The agent could not update itself just now; you can run the check from the Learning screen.";
  }
  return { ok: true, message: `Saved ${parts.join(" and ")}.${learned}`, errors: {}, values };
}
