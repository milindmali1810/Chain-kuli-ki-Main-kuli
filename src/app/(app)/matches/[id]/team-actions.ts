"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { loadEditorData } from "@/lib/editor";
import { checkSelection } from "@/lib/editorLogic";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

export interface ConfirmState {
  ok: boolean;
  message: string;
  problems: string[];
}

const fail = (message: string, problems: string[] = []): ConfirmState => ({ ok: false, message, problems });

// Saves Aryan's confirmed team. Nothing the browser sends is trusted: the players, roles and credits come from the
// database again, the same rules checker runs again, and the lock time is checked again.
export async function confirmTeam(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!(await isValidToken(token, process.env.APP_PIN))) return fail("Your session has ended. Enter the PIN again.");

  const cricsheetId = String(formData.get("match") ?? "");
  let payload: { ids?: unknown; captainId?: unknown; viceId?: unknown };
  try {
    payload = JSON.parse(String(formData.get("team") ?? "{}"));
  } catch {
    return fail("Couldn't read your team. Refresh the page and try again.");
  }
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((x): x is number => Number.isInteger(x)) : [];
  const captainId = Number.isInteger(payload.captainId) ? (payload.captainId as number) : null;
  const viceId = Number.isInteger(payload.viceId) ? (payload.viceId as number) : null;
  if (ids.length === 0 || ids.length > 15) return fail("Pick your players first.");

  const data = await loadEditorData(cricsheetId);
  if (!data) return fail("That match was not found.");
  if (data.mode === "locked") return fail("This match has started, so teams are locked.");

  const check = checkSelection(data.pool, ids, captainId, viceId);
  if (!check.result.valid) {
    const problems = check.result.violations.map((v) => v.message);
    return fail(`Your team has ${problems.length} problem${problems.length === 1 ? "" : "s"}. It was not saved.`, problems);
  }

  const { error } = await serverDb().from("user_teams").upsert(
    {
      match_id: data.matchId,
      players_json: { ids, agentStage: data.agent?.stage ?? null, totalCredits: check.credits, rulesProfile: check.result.profile, practice: data.mode === "practice" },
      captain_id: captainId,
      vc_id: viceId,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (error) return fail("Couldn't save. Try again in a moment.");

  revalidatePath(`/matches/${cricsheetId}`);
  return {
    ok: true,
    message: data.mode === "practice" ? "Saved as practice. This match was already played, so nothing is entered in Dream11." : "Team confirmed. Enter it in Dream11 before the match starts.",
    problems: [],
  };
}
