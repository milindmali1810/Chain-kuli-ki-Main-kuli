// Records a tuned setting as a NEW rubric version (the old one is retired, never edited), so it shows on the Learning
// screen with its reason and can be undone there.
// Runs outside Vercel:
//   npm run rubric:set -- --reason "Why" form.shrinkK=40 form.recentWeight=0.6
// Each assignment is a dotted path into the rubric and a number, e.g. form.shrinkK=40.

import { loadActiveRubric, serverDb } from "../src/lib/db";

const args = process.argv.slice(2);
const ri = args.indexOf("--reason");
const reason = ri >= 0 ? args[ri + 1] : undefined;
const edits = args.filter((a, i) => a.includes("=") && i !== ri + 1);
if (!reason || edits.length === 0) throw new Error('Usage: npm run rubric:set -- --reason "Why" form.shrinkK=40 [more path=value ...]');

async function main() {
  const db = serverDb();
  const active = await loadActiveRubric(db);
  if (!active) throw new Error("No active rubric version.");
  const cfg = JSON.parse(JSON.stringify(active.cfg)) as Record<string, unknown>;
  const changes: string[] = [];
  for (const e of edits) {
    const [path, raw] = e.split("=");
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${path}: ${raw} is not a number`);
    const keys = path.split(".");
    let node = cfg as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const k of keys) {
      if (node[k] === undefined) throw new Error(`${path}: no such setting`);
      node = node[k];
    }
    // node is now a Sourced value; change the number and say where the new one came from.
    if (typeof node.value !== "number") throw new Error(`${path} is not a single number`);
    const old = node.value;
    node.value = value;
    node.source = `${reason} (was ${old}; tested on past matches with npm run evaluate)`;
    node.status = "likely";
    changes.push(`${path} ${old} to ${value}`);
  }
  const { data: row, error } = await db
    .from("rubric_versions")
    .insert({ parent_id: active.id, config_json: cfg, status: "active", reason: `${reason}: ${changes.join("; ")}` })
    .select("id")
    .single();
  if (error) throw new Error(`rubric_versions: ${error.message}`);
  await db.from("rubric_versions").update({ status: "retired" }).eq("id", active.id);
  await db.from("pending_adjustments").delete().eq("rubric_version_id", active.id).eq("status", "pending");
  console.log(`New rubric version #${row.id} is active (parent #${active.id}): ${changes.join("; ")}`);
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
