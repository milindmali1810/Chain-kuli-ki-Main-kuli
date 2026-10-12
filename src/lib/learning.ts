import type { SupabaseClient } from "@supabase/supabase-js";
import type { RubricConfig } from "@/config/rubric";
import type { Role } from "@/config/rules";
import { ROLES } from "@/config/rules";
import { AUTO_LEARNING, DEFAULT_LEARNING, computeMetrics, proposeCalibration, type CompareRow, type LearningSettings, type Metrics, type Proposal } from "./calibration";
import { loadActiveRubric, serverDb } from "./db";
import { summariseEdge } from "./edge";
import type { FieldStats } from "./fieldStats";

// Server-side learning loop: compare predicted with actual, propose corrections, and (when a person accepts)
// create a new rubric version. SERVER ONLY.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface VersionRows {
  versionId: number;
  rows: CompareRow[];
  regrets: number[];
}

// Real Dream11 points win over points computed from the scorecard.
function pickActual(rows: Row[]): Map<number, number> {
  const best = new Map<number, { points: number; manual: boolean }>();
  for (const r of rows) {
    const manual = r.source === "dream11_manual";
    const have = best.get(r.player_id);
    if (!have || (manual && !have.manual)) best.set(r.player_id, { points: Number(r.points), manual });
  }
  return new Map([...best].map(([id, v]) => [id, v.points]));
}

// Every player of every FINAL recommendation (confirmed XI, so availability is not part of the error), grouped by
// the rubric version that produced it.
export async function loadCompareRows(db: SupabaseClient): Promise<VersionRows[]> {
  const { data: recs } = await db.from("recommendations").select("id, match_id, rubric_version_id, captain_id").eq("stage", "final");
  if (!recs?.length) return [];
  const matchIds = [...new Set(recs.map((r) => r.match_id))];
  const [{ data: players }, { data: actual }, { data: ctx }] = await Promise.all([
    db.from("recommendation_players").select("recommendation_id, player_id, expected_points, factors_json").in("recommendation_id", recs.map((r) => r.id)),
    db.from("actual_points").select("match_id, player_id, points, source").in("match_id", matchIds),
    db.from("match_context").select("match_id, pitch_tags_json").in("match_id", matchIds),
  ]);
  const pitchOf = new Map((ctx ?? []).map((c) => [c.match_id, (c.pitch_tags_json as Row | null)?.tag ?? "NEUTRAL"]));

  const byVersion = new Map<number, VersionRows>();
  for (const rec of recs) {
    const actualRows = (actual ?? []).filter((a) => a.match_id === rec.match_id);
    if (actualRows.length === 0) continue; // not played yet: nothing to compare with
    const actualMap = pickActual(actualRows);
    const ps = (players ?? []).filter((p) => p.recommendation_id === rec.id);
    const v: VersionRows = byVersion.get(rec.rubric_version_id) ?? { versionId: rec.rubric_version_id, rows: [], regrets: [] };
    for (const p of ps) {
      v.rows.push({
        matchId: rec.match_id,
        role: ((p.factors_json as Row)?.role ?? "BAT") as Role,
        predicted: Number(p.expected_points),
        actual: actualMap.get(p.player_id) ?? 0,
        pitch: pitchOf.get(rec.match_id) ?? "NEUTRAL",
      });
    }
    const points = ps.map((p) => actualMap.get(p.player_id) ?? 0);
    const captain = actualMap.get(rec.captain_id) ?? 0;
    if (points.length) v.regrets.push(Math.max(...points) - captain);
    byVersion.set(rec.rubric_version_id, v);
  }
  return [...byVersion.values()];
}

export interface VersionView {
  id: number;
  status: string;
  reason: string | null;
  createdAt: string;
  calibration: Record<Role, number>;
  metrics: Metrics;
  // The same measurement restricted to the matches the first version also predicted: a like-for-like comparison.
  metricsSameMatches: Metrics;
  // How the agent's team did against a random legal team and against the average player (backtests only; null if none stored).
  edge: EdgeView | null;
}

export interface EdgeView {
  matches: number;
  pickedAvg: number;
  randomAvg: number;
  fieldAvg: number;
  vsRandom: number; // points per player, positive = the agent did better
  vsRandomSe: number;
  winsVsRandom: number;
  vsField: number;
}

// The stored comparison (written by the backtest) summed up per rubric version, using FINAL teams.
async function loadEdges(db: SupabaseClient): Promise<Map<number, EdgeView>> {
  const { data: recs } = await db.from("recommendations").select("rubric_version_id, engine_notes_json").eq("stage", "final");
  const byVersion = new Map<number, FieldStats[]>();
  for (const r of recs ?? []) {
    const fs = (r.engine_notes_json as Row | null)?.fieldStats as FieldStats | undefined;
    if (!fs || fs.randomLegalAvg === null) continue;
    byVersion.set(r.rubric_version_id, [...(byVersion.get(r.rubric_version_id) ?? []), fs]);
  }
  const out = new Map<number, EdgeView>();
  for (const [id, list] of byVersion) {
    const vsRandom = summariseEdge(list.map((f) => ({ picked: [f.pickedAvg], field: [f.randomLegalAvg as number], pairs: [] })));
    const vsField = summariseEdge(list.map((f) => ({ picked: [f.pickedAvg], field: [f.fieldAvg], pairs: [] })));
    out.set(id, {
      matches: vsRandom.matches, pickedAvg: vsRandom.pickedAvg, randomAvg: vsRandom.fieldAvg, fieldAvg: vsField.fieldAvg,
      vsRandom: vsRandom.edge, vsRandomSe: vsRandom.se, winsVsRandom: vsRandom.wins, vsField: vsField.edge,
    });
  }
  return out;
}

export interface PendingView {
  id: number;
  parameter: string;
  oldValue: number;
  newValue: number;
  plainEnglish: string;
  evidence: Row;
}

export interface LearningView {
  allMetrics: Metrics;
  versions: VersionView[];
  activeVersionId: number | null;
  pending: PendingView[];
  settings: typeof DEFAULT_LEARNING;
  rowsUnderActive: number;
  mode: LearningMode;
  canUndo: boolean; // the active version was created by a learning change and has a parent to go back to
  realDream11Rows: number; // compared players whose actual points were typed by Aryan from Dream11
}

export async function getLearning(): Promise<LearningView> {
  const db = serverDb();
  const [{ data: versions }, { data: pending }, perVersion, active, edges] = await Promise.all([
    db.from("rubric_versions").select("id, status, reason, created_at, config_json, parent_id").order("id"),
    db.from("pending_adjustments").select("*").eq("status", "pending").order("id"),
    loadCompareRows(db),
    loadActiveRubric(db),
    loadEdges(db),
  ]);
  const rowsOf = (id: number) => perVersion.find((v) => v.versionId === id);
  const baseline = [...perVersion].sort((a, b) => a.versionId - b.versionId)[0];
  const baselineMatches = new Set((baseline?.rows ?? []).map((r) => r.matchId));
  // The headline numbers describe the FIRST version only, so a later version's matches are not double counted.
  const all = baseline?.rows ?? [];
  const allRegrets = baseline?.regrets ?? [];

  return {
    allMetrics: computeMetrics(all, allRegrets),
    versions: (versions ?? []).map((v) => {
      const cal = ((v.config_json as Row)?.calibration ?? {}) as Record<string, { value: number }>;
      const r = rowsOf(v.id);
      return {
        id: v.id,
        status: v.status,
        reason: v.reason,
        createdAt: v.created_at,
        calibration: Object.fromEntries(ROLES.map((role) => [role, cal[role]?.value ?? 1])) as Record<Role, number>,
        metrics: computeMetrics(r?.rows ?? [], r?.regrets ?? []),
        metricsSameMatches: computeMetrics((r?.rows ?? []).filter((row) => baselineMatches.has(row.matchId)), []),
        edge: edges.get(v.id) ?? null,
      };
    }),
    activeVersionId: active?.id ?? null,
    pending: (pending ?? [])
      .filter((p) => p.rubric_version_id === active?.id)
      .map((p) => ({
        id: p.id, parameter: p.parameter, oldValue: Number(p.old_value), newValue: Number(p.new_value),
        plainEnglish: (p.evidence_json as Row)?.plainEnglish ?? "", evidence: (p.evidence_json as Row) ?? {},
      })),
    settings: DEFAULT_LEARNING,
    rowsUnderActive: (active && rowsOf(active.id)?.rows.length) || 0,
    mode: await getLearningMode(db),
    canUndo: (versions ?? []).some((v) => v.id === active?.id && v.parent_id !== null),
    realDream11Rows: await countRealRows(db),
  };
}

// Recompute the evidence for the active version and replace its pending proposals.
export async function runCalibration(
  db: SupabaseClient = serverDb(),
  settings: LearningSettings = DEFAULT_LEARNING,
  trigger: string = "manual",
): Promise<{ metrics: Metrics; proposals: Proposal[]; versionId: number }> {
  const active = await loadActiveRubric(db);
  if (!active) throw new Error("No active rubric version. Run a backtest first.");
  const perVersion = await loadCompareRows(db);
  const mine = perVersion.find((v) => v.versionId === active.id);
  const metrics = computeMetrics(mine?.rows ?? [], mine?.regrets ?? []);
  const current = Object.fromEntries(ROLES.map((r) => [r, active.cfg.calibration[r].value])) as Record<Role, number>;
  const proposals = proposeCalibration(metrics, current, settings);

  await db.from("pending_adjustments").delete().eq("rubric_version_id", active.id).eq("status", "pending");
  if (proposals.length) {
    const { error } = await db.from("pending_adjustments").insert(
      proposals.map((p) => ({
        rubric_version_id: active.id, parameter: p.parameter, old_value: p.oldValue, new_value: p.newValue,
        evidence_json: { ...p.evidence, plainEnglish: p.plainEnglish }, status: "pending",
      })),
    );
    if (error) throw new Error(`pending_adjustments: ${error.message}`);
  }
  await db.from("calibration_runs").insert({ rubric_version_id: active.id, metrics_json: { ...metrics, trigger, rate: settings.rate } });
  return { metrics, proposals, versionId: active.id };
}

// Accept: the pending proposals become a NEW rubric version (the old one is kept, marked retired).
export async function acceptPending(
  db: SupabaseClient = serverDb(),
  opts: { auto?: boolean; note?: string } = {},
): Promise<{ newVersionId: number } | null> {
  const active = await loadActiveRubric(db);
  if (!active) return null;
  const { data: pending } = await db.from("pending_adjustments").select("*").eq("rubric_version_id", active.id).eq("status", "pending");
  if (!pending?.length) return null;

  const { count } = await db.from("rubric_versions").select("id", { count: "exact", head: true });
  const next = structuredClone(active.cfg) as RubricConfig;
  next.id = `v1.${count ?? 1}`;
  const today = new Date().toISOString().slice(0, 10);
  for (const p of pending) {
    const role = String(p.parameter).split(".")[1] as Role;
    next.calibration[role] = {
      value: Number(p.new_value),
      status: "likely",
      source: `learning loop, ${opts.auto ? "applied automatically" : "accepted by Aryan"} on ${today}: ${(p.evidence_json as Row)?.plainEnglish ?? ""}`,
    };
  }
  const changes = pending.map((p) => `${p.parameter} ${p.old_value} to ${p.new_value}`).join("; ");
  const reason = opts.auto ? `Automatic learning${opts.note ? ` (${opts.note})` : ""}: ${changes}` : `Accepted learning-loop proposal: ${changes}`;
  const { data: created, error } = await db
    .from("rubric_versions")
    .insert({ parent_id: active.id, config_json: next, status: "active", reason })
    .select("id")
    .single();
  if (error) throw new Error(`rubric_versions: ${error.message}`);
  await db.from("rubric_versions").update({ status: "retired" }).eq("id", active.id);
  await db.from("pending_adjustments").update({ status: "accepted" }).in("id", pending.map((p) => p.id));
  return { newVersionId: created.id };
}

export async function rejectPending(db: SupabaseClient = serverDb()): Promise<number> {
  const active = await loadActiveRubric(db);
  if (!active) return 0;
  const { data } = await db.from("pending_adjustments").update({ status: "rejected" }).eq("rubric_version_id", active.id).eq("status", "pending").select("id");
  return data?.length ?? 0;
}

// ---------- Automatic learning ----------
export type LearningMode = "auto" | "ask";

export async function getLearningMode(db: SupabaseClient = serverDb()): Promise<LearningMode> {
  const { data } = await db.from("app_settings").select("value").eq("key", "learning_mode").maybeSingle();
  return data?.value === "ask" ? "ask" : "auto"; // automatic is the default
}

export async function setLearningMode(mode: LearningMode, db: SupabaseClient = serverDb()): Promise<void> {
  await db.from("app_settings").upsert({ key: "learning_mode", value: mode, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export interface LearningOutcome {
  mode: LearningMode;
  comparedPlayers: number;
  matches: number;
  applied: boolean;
  newVersionId: number | null;
  proposals: Proposal[];
  message: string; // plain English, shown to Aryan right after he saves points
}

// Runs right after Aryan saves a match's points. It re-checks how wrong the agent was and, in automatic mode, applies a
// small safe correction as a NEW rubric version that the next prediction will use. In "ask" mode it only stores proposals.
// It only learns from matches predicted under the CURRENT version, so a match is never learned from twice.
export async function learnAfterPoints(matchLabel: string, db: SupabaseClient = serverDb()): Promise<LearningOutcome> {
  const mode = await getLearningMode(db);
  const settings = mode === "auto" ? AUTO_LEARNING : DEFAULT_LEARNING;
  const { metrics, proposals } = await runCalibration(db, settings, `points saved for ${matchLabel}`);
  const base = { mode, comparedPlayers: metrics.n, matches: metrics.matches, proposals };

  if (proposals.length === 0) {
    const need = metrics.n < settings.minRows
      ? ` It needs about ${settings.minRows} compared players before it changes anything, and has ${metrics.n}.`
      : " No role is consistently off, so nothing needs changing.";
    return { ...base, applied: false, newVersionId: null, message: `The agent checked its predictions against your points.${need}` };
  }
  if (mode === "ask") {
    return { ...base, applied: false, newVersionId: null, message: `The agent found ${proposals.length} pattern(s) and is waiting for you on the Learning screen.` };
  }
  if (metrics.matches < settings.minMatchesAuto) {
    return {
      ...base, applied: false, newVersionId: null,
      message: `The agent noticed ${proposals.length} pattern(s) but is waiting for evidence from at least ${settings.minMatchesAuto} matches before changing anything automatically (it has ${metrics.matches}).`,
    };
  }
  const done = await acceptPending(db, { auto: true, note: `after ${matchLabel}, ${metrics.n} players across ${metrics.matches} matches` });
  if (!done) return { ...base, applied: false, newVersionId: null, message: "The agent found patterns but could not apply them." };
  return {
    ...base, applied: true, newVersionId: done.newVersionId,
    message: `The agent learned from your points and updated its rubric (version #${done.newVersionId}): ${proposals.map((p) => `${p.role} x${p.newValue}`).join(", ")}. The next match uses it. You can undo this on the Learning screen.`,
  };
}

// Undo: go back to the parent version. The undone version is kept (marked retired) so the history stays complete.
export async function revertLastChange(db: SupabaseClient = serverDb()): Promise<number | null> {
  const { data: active } = await db.from("rubric_versions").select("id, parent_id, reason").eq("status", "active").order("id", { ascending: false }).limit(1).maybeSingle();
  if (!active?.parent_id) return null;
  await db.from("rubric_versions").update({ status: "retired", reason: `${active.reason ?? "Learning change"} (undone by Aryan)` }).eq("id", active.id);
  await db.from("rubric_versions").update({ status: "active" }).eq("id", active.parent_id);
  await db.from("pending_adjustments").delete().eq("rubric_version_id", active.parent_id).eq("status", "pending");
  return active.parent_id;
}

// How many stored actual-points rows were typed by Aryan from Dream11 (as opposed to calculated from the scorecard).
async function countRealRows(db: SupabaseClient): Promise<number> {
  const { count } = await db.from("actual_points").select("player_id", { count: "exact", head: true }).eq("source", "dream11_manual");
  return count ?? 0;
}
