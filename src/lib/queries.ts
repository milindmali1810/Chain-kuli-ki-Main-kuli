import { DEFAULT_RULES_PROFILE, RULES_PROFILES } from "@/config/rules";
import { serverDb } from "./db";
import { teamScore } from "./teamScore";
import { venueLabel } from "./format";

// Read-only queries for the dashboard. SERVER ONLY: they use the secret key, so import them from server
// components and server actions, never from a client component.

const rules = RULES_PROFILES[DEFAULT_RULES_PROFILE];

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Real Dream11 points typed by Aryan win over points computed from the scorecard.
function pickActual(rows: Row[]): Map<number, { points: number; source: string }> {
  const out = new Map<number, { points: number; source: string }>();
  for (const r of rows) {
    const have = out.get(r.player_id);
    if (!have || (r.source === "dream11_manual" && have.source !== "dream11_manual")) {
      out.set(r.player_id, { points: Number(r.points), source: r.source });
    }
  }
  return out;
}

export interface StageSummary {
  predicted: number;
  actual: number | null;
  valid: boolean;
}

export interface MatchCard {
  cricsheetId: string;
  date: string;
  teams: [string, string];
  venue: string;
  // What Aryan's own confirmed team scored (null until every one of his players has points on file).
  yourTeam?: { total: number | null; reportedTotal: number | null; unedited: boolean };
  stages: { final?: StageSummary; provisional?: StageSummary };
  actualSource: "dream11_manual" | "computed_from_scorecard" | null;
  upcoming?: boolean; // a match that has not been played: found by the agent or added by hand
  startUtc?: string; // exact start time, for upcoming matches
  creditsSeeded?: boolean; // true unless every credit was typed from Dream11
}

export async function listMatches(): Promise<MatchCard[]> {
  const db = serverDb();
  const { data: recs } = await db.from("recommendations").select("id, match_id, stage, captain_id, vc_id, engine_notes_json");
  const upcoming = await listUpcomingWithoutTeam(db, (recs ?? []).map((r) => r.match_id));
  if (!recs?.length) return upcoming;
  const matchIds = [...new Set(recs.map((r) => r.match_id))];
  const [{ data: matches }, { data: teams }, { data: players }, { data: actual }, { data: userTeams }] = await Promise.all([
    db.from("matches").select("id, cricsheet_match_id, start_time, team_a, team_b, venues(name, city)").in("id", matchIds),
    db.from("teams").select("id, name"),
    db.from("recommendation_players").select("recommendation_id, player_id, expected_points").in("recommendation_id", recs.map((r) => r.id)),
    db.from("actual_points").select("match_id, player_id, points, source").in("match_id", matchIds),
    db.from("user_teams").select("match_id, players_json, captain_id, vc_id").in("match_id", matchIds),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));

  const cards: MatchCard[] = [];
  for (const m of matches ?? []) {
    const actualRows = (actual ?? []).filter((a) => a.match_id === m.id);
    const actualMap = pickActual(actualRows);
    const hasManual = actualRows.some((a) => a.source === "dream11_manual");
    const card: MatchCard = {
      cricsheetId: m.cricsheet_match_id,
      date: String(m.start_time).slice(0, 10),
      teams: [teamName.get(m.team_a) ?? "?", teamName.get(m.team_b) ?? "?"],
      venue: venueLabel((m.venues as unknown as Row | null)?.name, (m.venues as unknown as Row | null)?.city),
      stages: {},
      actualSource: actualRows.length === 0 ? null : hasManual ? "dream11_manual" : "computed_from_scorecard",
      upcoming: String(m.cricsheet_match_id).startsWith("live-") && actualRows.length === 0,
      startUtc: String(m.start_time),
    };
    // Aryan's own team: the total is shown only when every one of his players has points on file.
    const mine = (userTeams ?? []).find((u) => u.match_id === m.id);
    if (mine) {
      const pj = (mine.players_json ?? {}) as Row;
      const ids = (pj.ids ?? []) as number[];
      const have = ids.length > 0 && ids.every((id) => actualMap.has(id));
      card.yourTeam = {
        total: have ? Math.round(teamScore(new Map([...actualMap].map(([id, v]) => [id, v.points])), ids, mine.captain_id, mine.vc_id, rules) * 10) / 10 : null,
        reportedTotal: typeof pj.reportedTotal === "number" ? pj.reportedTotal : null,
        unedited: pj.unedited === true,
      };
    }
    // Several rubric versions can hold a recommendation for the same match: the latest one is shown.
    for (const rec of recs.filter((r) => r.match_id === m.id).sort((a, b) => a.id - b.id)) {
      const ps = (players ?? []).filter((p) => p.recommendation_id === rec.id);
      const ids = ps.map((p) => p.player_id);
      const predicted = teamScore(new Map(ps.map((p) => [p.player_id, Number(p.expected_points)])), ids, rec.captain_id, rec.vc_id, rules);
      const actualTotal = actualRows.length === 0 ? null : teamScore(new Map([...actualMap].map(([id, v]) => [id, v.points])), ids, rec.captain_id, rec.vc_id, rules);
      card.stages[rec.stage as "final" | "provisional"] = { predicted, actual: actualTotal, valid: rec.engine_notes_json?.validation?.valid ?? true };
      card.creditsSeeded = rec.engine_notes_json?.creditsSource !== "manual";
    }
    cards.push(card);
  }
  // Matches still to be played come first, soonest first; played ones follow, newest first.
  const all = [...upcoming, ...cards];
  const soon = all.filter((c) => c.upcoming).sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)));
  const played = all.filter((c) => !c.upcoming).sort((a, b) => b.date.localeCompare(a.date) || b.cricsheetId.localeCompare(a.cricsheetId));
  return [...soon, ...played];
}

// Matches Aryan added by hand that have no recommended team yet (the squad and credits come in the next steps).
async function listUpcomingWithoutTeam(db: ReturnType<typeof serverDb>, haveTeam: number[]): Promise<MatchCard[]> {
  const { data } = await db
    .from("matches")
    .select("id, cricsheet_match_id, start_time, team_a, team_b, venues(name, city)")
    .eq("data_origin", "manual");
  const rows = (data ?? []).filter((m) => !haveTeam.includes(m.id));
  if (rows.length === 0) return [];
  const { data: teams } = await db.from("teams").select("id, name");
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));
  return rows.map((m) => ({
    cricsheetId: m.cricsheet_match_id,
    date: String(m.start_time).slice(0, 10),
    teams: [teamName.get(m.team_a) ?? "?", teamName.get(m.team_b) ?? "?"] as [string, string],
    venue: venueLabel((m.venues as unknown as Row | null)?.name, (m.venues as unknown as Row | null)?.city),
    stages: {},
    actualSource: null,
    upcoming: true,
    startUtc: String(m.start_time),
  }));
}

// ---------- One match ----------
export interface PlayerRow {
  playerId: number;
  name: string;
  role: string;
  team: string;
  credits: number;
  expected: number;
  actual: number | null; // null = match not played / no actual yet
  played: boolean; // false = not in the confirmed XI
  isCaptain: boolean;
  isViceCaptain: boolean;
  reason: string | null;
  reasonSource: string | null;
  lastPoints: number[];
  pPlay: number;
  venueMultiplier: number;
  teamFormMultiplier: number;
}

export interface StageView {
  stage: "final" | "provisional";
  recommendationId: number;
  players: PlayerRow[];
  predicted: number;
  actual: number | null;
  totalCredits: number;
  creditsSeeded: boolean; // false only when every credit was typed from Dream11
  captainReason: string | null;
  viceReason: string | null;
  summary: string | null;
  validation: { valid: boolean; profile: string; violations: { message: string }[] } | null;
  deathLog: string[];
  notes: string[];
  unavailableFactors: string[];
  excluded: { name: string; reason: string }[];
}

export interface MatchDetail {
  cricsheetId: string;
  matchId: number;
  date: string;
  startUtc: string;
  upcoming: boolean; // not played yet and found by the agent or added by hand
  teams: [string, string];
  venue: string;
  weather: { tempC: number | null; humidityPct: number | null; dewPointC: number | null; rainMm: number | null; cloudPct: number | null; windKmh: number | null } | null;
  pitch: { tag: string; index: number | null; matches: number; lowConfidence: boolean } | null;
  teamForm: Record<string, { multiplier: number }>;
  pitchReport: string | null;
  stages: { final?: StageView; provisional?: StageView };
  hasActual: boolean;
  actualSource: string | null;
}

export async function getMatch(cricsheetId: string): Promise<MatchDetail | null> {
  const db = serverDb();
  const { data: m } = await db
    .from("matches")
    .select("id, cricsheet_match_id, start_time, team_a, team_b, venues(name, city)")
    .eq("cricsheet_match_id", cricsheetId)
    .maybeSingle();
  if (!m) return null;

  const [{ data: teams }, { data: ctx }, { data: recs }, { data: actual }, { data: xi }] = await Promise.all([
    db.from("teams").select("id, name"),
    db.from("match_context").select("weather_json, pitch_tags_json, pitch_report_text").eq("match_id", m.id).maybeSingle(),
    db.from("recommendations").select("*").eq("match_id", m.id).order("id"), // oldest first, so the latest version overwrites per stage
    db.from("actual_points").select("player_id, points, source").eq("match_id", m.id),
    db.from("predicted_xi").select("player_id, team_id, source").eq("match_id", m.id),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));
  const actualMap = pickActual((actual ?? []).map((a) => ({ ...a })));
  const hasActual = (actual ?? []).length > 0;
  const confirmed = new Set((xi ?? []).filter((x) => x.source === "confirmed").map((x) => x.player_id));
  const teamOf = new Map((xi ?? []).map((x) => [x.player_id, teamName.get(x.team_id) ?? "?"]));

  const stages: MatchDetail["stages"] = {};
  for (const rec of recs ?? []) {
    const { data: rows } = await db
      .from("recommendation_players")
      .select("player_id, rank, expected_points, factors_json, reason_text, players(name)")
      .eq("recommendation_id", rec.id)
      .order("rank");
    const players: PlayerRow[] = (rows ?? []).map((r: Row) => {
      const f = r.factors_json ?? {};
      const played = confirmed.has(r.player_id);
      const a = actualMap.get(r.player_id);
      return {
        playerId: r.player_id,
        name: r.players?.name ?? "?",
        role: f.role ?? "?",
        team: teamOf.get(r.player_id) ?? "?",
        credits: Number(f.credits ?? 0),
        expected: Number(r.expected_points),
        actual: hasActual ? (a ? a.points : 0) : null,
        played: hasActual ? played : true,
        isCaptain: r.player_id === rec.captain_id,
        isViceCaptain: r.player_id === rec.vc_id,
        reason: r.reason_text,
        reasonSource: f.reasonSource ?? null,
        lastPoints: f.lastPoints ?? [],
        pPlay: f.pPlay ?? 1,
        venueMultiplier: f.venueMultiplier ?? 1,
        teamFormMultiplier: f.teamFormMultiplier ?? 1,
      };
    });
    const ids = players.map((p) => p.playerId);
    const exp = new Map(players.map((p) => [p.playerId, p.expected]));
    const act = new Map(players.map((p) => [p.playerId, p.actual ?? 0]));
    const notes = rec.engine_notes_json ?? {};
    stages[rec.stage as "final" | "provisional"] = {
      stage: rec.stage,
      recommendationId: rec.id,
      players,
      predicted: teamScore(exp, ids, rec.captain_id, rec.vc_id, rules),
      actual: hasActual ? teamScore(act, ids, rec.captain_id, rec.vc_id, rules) : null,
      totalCredits: Math.round(players.reduce((a, p) => a + p.credits, 0) * 10) / 10,
      creditsSeeded: notes.creditsSource !== "manual",
      captainReason: rec.captain_reason,
      viceReason: rec.vc_reason,
      summary: rec.summary_text,
      validation: notes.validation ?? null,
      deathLog: notes.deathLog ?? [],
      notes: notes.notes ?? [],
      unavailableFactors: notes.unavailableFactors ?? [],
      excluded: (notes.excluded ?? []).map((e: Row) => ({ name: e.name, reason: e.reason })),
    };
  }

  const pitchJson = ctx?.pitch_tags_json as Row | null;
  const w = (ctx?.weather_json as Row | null)?.summary ?? null;
  return {
    cricsheetId: m.cricsheet_match_id,
    matchId: m.id,
    date: String(m.start_time).slice(0, 10),
    startUtc: String(m.start_time),
    upcoming: String(m.cricsheet_match_id).startsWith("live-") && !hasActual,
    teams: [teamName.get(m.team_a) ?? "?", teamName.get(m.team_b) ?? "?"],
    venue: venueLabel((m.venues as unknown as Row | null)?.name, (m.venues as unknown as Row | null)?.city),
    weather: w,
    pitch: pitchJson ? { tag: pitchJson.tag, index: pitchJson.index ?? null, matches: pitchJson.matches ?? 0, lowConfidence: pitchJson.lowConfidence ?? true } : null,
    teamForm: pitchJson?.teamForm ?? {},
    pitchReport: ctx?.pitch_report_text ?? null,
    stages,
    hasActual,
    actualSource: hasActual ? ((actual ?? []).some((a) => a.source === "dream11_manual") ? "dream11_manual" : "computed_from_scorecard") : null,
  };
}
