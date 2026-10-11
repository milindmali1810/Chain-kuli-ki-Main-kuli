"use server";

import { revalidatePath } from "next/cache";
import { assertPin } from "@/lib/auth";
import { serverDb } from "@/lib/db";

const ROLES = new Set(["WK", "BAT", "AR", "BOWL"]);

// Manual values always win over inferred ones (docs/ARCHITECTURE.md). Used the next time a prediction is made.
export async function saveRoleOverride(formData: FormData): Promise<void> {
  await assertPin();
  const playerId = Number(formData.get("playerId"));
  const role = String(formData.get("role") ?? "");
  if (!Number.isInteger(playerId) || !ROLES.has(role)) return;

  const db = serverDb();
  await db.from("manual_overrides").delete().eq("entity_type", "player").eq("entity_id", playerId).eq("field", "role");
  await db.from("manual_overrides").insert({ entity_type: "player", entity_id: playerId, field: "role", value: role, note: "entered by Aryan" });
  revalidatePath("/data");
}

export async function removeRoleOverride(formData: FormData): Promise<void> {
  await assertPin();
  const playerId = Number(formData.get("playerId"));
  if (!Number.isInteger(playerId)) return;
  await serverDb().from("manual_overrides").delete().eq("entity_type", "player").eq("entity_id", playerId).eq("field", "role");
  revalidatePath("/data");
}
