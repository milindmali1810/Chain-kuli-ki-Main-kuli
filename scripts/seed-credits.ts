// Seeds credits for the players of one match (SEEDED, not Dream11's real numbers).
// Runs outside Vercel:  npm run seed:credits -- --match 1529230
// Uses only matches strictly before the match date, so a backtest cannot peek.

import type { Role } from "../src/config/rules";
import { serverDb, loadHistoryRows, monthsBefore } from "../src/lib/db";
import { averagePoints, fantasyPointsSeries, type HistoryRow } from "../src/lib/history";
import { seededCredit } from "../src/lib/seedCredits";

const WINDOW_MONTHS = 36;
const MIN_MATCHES_FOR_REFERENCE = 8;

const args = process.argv.slice(2);
const i = args.indexOf("--match");
const cricsheetId = i >= 0 ? args[i + 1] : undefined;
if (!cricsheetId) throw new Error("Usage: npm run seed:credits -- --match <cricsheet match id>");

async function main() {
  const db = serverDb();
  const { data: match, error } = await db.from("matches").select("id, start_time").eq("cricsheet_match_id", cricsheetId).single();
  if (error) throw new Error(`match ${cricsheetId}: ${error.message}`);
  const date = String(match.start_time).slice(0, 10);

  const { data: squad, error: squadErr } = await db.from("player_match_lines").select("player_id, players(name, role)").eq("match_id", match.id);
  if (squadErr) throw new Error(squadErr.message);

  const rows = await loadHistoryRows(db, monthsBefore(date, WINDOW_MONTHS), date);
  console.log(`History: ${rows.length} rows from ${monthsBefore(date, WINDOW_MONTHS)} up to (not including) ${date}`);
  const byPlayer = new Map<number, HistoryRow[]>();
  for (const r of rows) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);

  // Roles for everyone with history (needed to score a match).
  const roles = new Map<number, Role>();
  for (let start = 0; ; start += 1000) {
    const { data, error: e } = await db.from("players").select("id, role").not("role", "is", null).order("id").range(start, start + 999);
    if (e) throw new Error(e.message);
    for (const p of data) roles.set(p.id, p.role as Role);
    if (data.length < 1000) break;
  }

  const avgOf = (playerId: number): { avg: number | null; n: number } => {
    const role = roles.get(playerId);
    if (!role) return { avg: null, n: 0 };
    const series = fantasyPointsSeries(byPlayer.get(playerId) ?? [], role);
    return { avg: averagePoints(series, 15), n: series.length };
  };

  // Reference group: established players, so one debutant's two lucky matches cannot skew the scale.
  const reference: number[] = [];
  for (const playerId of byPlayer.keys()) {
    const { avg, n } = avgOf(playerId);
    if (avg !== null && n >= MIN_MATCHES_FOR_REFERENCE) reference.push(avg);
  }
  console.log(`Reference group: ${reference.length} established players`);

  const out: { match_id: number; player_id: number; credits: number; source: string }[] = [];
  const table: string[] = [];
  for (const s of squad as unknown as { player_id: number; players: { name: string; role: string | null } }[]) {
    const { avg, n } = avgOf(s.player_id);
    const credit = seededCredit(avg, reference);
    table.push(`${s.players.name.padEnd(18)} ${String(s.players.role ?? "-").padEnd(5)} matches=${String(n).padStart(2)}  avg pts=${avg === null ? "  n/a" : avg.toFixed(1).padStart(5)}  credits=${credit ?? "unavailable"}`);
    if (credit !== null) out.push({ match_id: match.id, player_id: s.player_id, credits: credit, source: "seeded" });
  }
  console.log(table.sort().join("\n"));

  const { error: saveErr } = await db.from("credits").upsert(out, { onConflict: "match_id,player_id" });
  if (saveErr) throw new Error(`saving credits: ${saveErr.message}`);
  console.log(`Saved ${out.length} seeded credits (source = seeded).`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
