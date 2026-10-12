"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { explainMatch } from "@/lib/explainMatch";
import { pickTeamForMatch } from "@/lib/livePipeline";
import { checkXI, parseCredit } from "@/lib/liveMatch";
import { loadSetup } from "@/lib/liveSetup";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

export interface SetupState {
  message: string;
  errors: Record<string, string>; // "cr_<id>", "extra_<teamId>" or "xi"
  values: Record<string, string>;
}

// Look a typed name up in the players table. Exactly one match is needed; two players with one name must not be guessed.
async function findPlayer(db: ReturnType<typeof serverDb>, name: string): Promise<{ id?: number; error?: string }> {
  const safe = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await db.from("players").select("id, name").ilike("name", safe).limit(3);
  if (!data || data.length === 0) return { error: `"${name}" is not in the data. Check the spelling (the full name as in the scorecards).` };
  if (data.length > 1) return { error: `More than one player is called "${name}". Ask Milind to add him by hand.` };
  return { id: data[0].id as number };
}

// Saves the squad ticks, the playing XI and the real Dream11 credits for an upcoming match. With intent "pick" it then
// asks the engine for a team and writes the explanations. Nothing the browser sends is trusted: the allowed players are
// worked out again here.
export async function saveSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && (k.startsWith("cr_") || k.startsWith("extra_") || k.startsWith("xi_"))) values[k] = v; // keep what was typed and ticked if the save fails

  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!(await isValidToken(token, process.env.APP_PIN))) return { message: "Your session has ended. Enter the PIN again.", errors: {}, values };

  const cricsheetId = String(formData.get("match") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  const setup = await loadSetup(cricsheetId);
  if (!setup) return { message: "That upcoming match was not found.", errors: {}, values };
  if (setup.locked) return { message: "This match has already started, so the team can no longer be changed.", errors: {}, values };
  const db = serverDb();
  const errors: Record<string, string> = {};

  // 1. Extra players Aryan typed in (not in the side's recent XIs).
  const players = new Map<number, { teamId: number; added: boolean; played: number }>();
  for (const t of setup.teams) for (const p of t.players) players.set(p.id, { teamId: t.teamId, added: p.added, played: p.played });
  for (const t of setup.teams) {
    const names = String(formData.get(`extra_${t.teamId}`) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      const r = await findPlayer(db, name);
      if (r.error) { errors[`extra_${t.teamId}`] = r.error; break; }
      if (!players.has(r.id!)) players.set(r.id!, { teamId: t.teamId, added: true, played: 0 });
    }
  }

  // 2. Credits typed from Dream11.
  const credits = new Map<number, number>();
  for (const id of players.keys()) {
    const text = String(formData.get(`cr_${id}`) ?? "");
    const c = parseCredit(text);
    if (c.error) errors[`cr_${id}`] = c.error;
    else if (c.value !== null) credits.set(id, c.value);
  }

  // 3. The playing XI (11 per team for both, or none).
  const ticked = new Set<number>();
  for (const id of players.keys()) if (formData.get(`xi_${id}`) === "on") ticked.add(id);
  const xiCheck = checkXI(setup.teams.map((t) => ({ team: t.name, ticked: [...ticked].filter((id) => players.get(id)!.teamId === t.teamId).length })));
  if (xiCheck.error) errors.xi = xiCheck.error;

  if (Object.keys(errors).length > 0) return { message: `${Object.keys(errors).length} thing(s) to fix. Nothing was saved.`, errors, values };

  // 4. Save.
  const recentMatches = Object.fromEntries(setup.teams.map((t) => [t.teamId, t.recentMatches]));
  const xiRows = [...players].map(([id, p]) => ({
    match_id: setup.matchId, team_id: p.teamId, player_id: id,
    source: ticked.has(id) ? "confirmed" : "predicted",
    // Appearances in the side's recent XIs as a share. Players added by hand have no share (null): see pickTeamForMatch.
    confidence: ticked.has(id) ? 1 : p.added ? null : p.played / Math.max(1, recentMatches[p.teamId]),
  }));
  const del = await db.from("predicted_xi").delete().eq("match_id", setup.matchId);
  if (del.error) return { message: "Couldn't save. Try again in a moment.", errors: {}, values };
  const ins = await db.from("predicted_xi").insert(xiRows);
  if (ins.error) return { message: "Couldn't save. Try again in a moment.", errors: {}, values };

  await db.from("credits").delete().eq("match_id", setup.matchId);
  if (credits.size > 0) {
    const up = await db.from("credits").insert([...credits].map(([player_id, c]) => ({ match_id: setup.matchId, player_id, credits: c, source: "manual" })));
    if (up.error) return { message: "Couldn't save the credits. Try again in a moment.", errors: {}, values };
  }
  revalidatePath("/");
  revalidatePath(`/matches/${cricsheetId}`);
  if (intent !== "pick") return { message: `Saved. ${credits.size} credits entered${xiCheck.confirmed ? ", playing XI confirmed" : ", no playing XI yet (predicted XIs will be used)"}.`, errors: {}, values };

  // 5. Pick my team.
  try {
    const r = await pickTeamForMatch(db, cricsheetId);
    if (r.picked === 0) {
      const why = r.excluded.length ? ` Left out: ${r.excluded.map((e) => `${e.name} (${e.reason})`).join("; ")}.` : "";
      return { message: `${r.message}${why} Add the missing credits, then try again.`, errors: {}, values };
    }
    // The reasons are written AFTER the answer is sent (Gemini takes about half a minute), so Aryan sees his team at once.
    // Gemini, or plain templates if Gemini fails or is not set up. If this hits a database problem the team is still
    // saved; the match screen keeps saying the reasons are being written.
    after(async () => {
      try {
        await explainMatch(db, cricsheetId, { useGemini: true, apiKey: process.env.GEMINI_API_KEY, onlyStages: [r.stage] });
        revalidatePath(`/matches/${cricsheetId}`);
      } catch {
        /* keep the saved team */
      }
    });
  } catch (e) {
    return { message: `Couldn't pick a team: ${e instanceof Error ? e.message : "unknown problem"}`, errors: {}, values };
  }
  redirect(`/matches/${cricsheetId}`);
}
