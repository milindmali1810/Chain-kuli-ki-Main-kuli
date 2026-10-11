"use server";

import { revalidatePath } from "next/cache";
import { assertPin } from "@/lib/auth";
import { acceptPending, rejectPending, revertLastChange, runCalibration, setLearningMode } from "@/lib/learning";

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

// Automatic: the agent applies small safe corrections itself after you save points. Ask first: it only proposes.
export async function chooseLearningMode(formData: FormData): Promise<void> {
  await assertPin();
  const mode = String(formData.get("mode")) === "ask" ? "ask" : "auto";
  await setLearningMode(mode);
  revalidatePath("/learning");
}

// Go back to the previous rubric version. The undone version stays in the history.
export async function undoLastChange(): Promise<void> {
  await assertPin();
  await revertLastChange();
  revalidatePath("/learning");
  revalidatePath("/");
}
