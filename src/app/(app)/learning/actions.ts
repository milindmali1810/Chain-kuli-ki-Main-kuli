"use server";

import { revalidatePath } from "next/cache";
import { assertPin } from "@/lib/auth";
import { acceptPending, rejectPending, runCalibration } from "@/lib/learning";

// "Look for patterns now": recompute the evidence and replace the pending proposals.
export async function checkForPatterns(): Promise<void> {
  await assertPin();
  await runCalibration();
  revalidatePath("/learning");
}

// Accept: the proposals become a new rubric version. Past predictions keep the version that made them.
export async function acceptChanges(): Promise<void> {
  await assertPin();
  await acceptPending();
  revalidatePath("/learning");
  revalidatePath("/");
}

export async function rejectChanges(): Promise<void> {
  await assertPin();
  await rejectPending();
  revalidatePath("/learning");
}
