import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db";
import { afterFailure, clientKey, lockStatus, parseAttempts } from "@/lib/loginGuard";
import { PIN_COOKIE, pinToken } from "@/lib/pin";

// The server checks the typed PIN against APP_PIN. The PIN never reaches the browser.
// Guessing is slowed down: 5 wrong PINs from one address means a 15-minute pause (see src/lib/loginGuard.ts).

const sha = (s: string) => createHash("sha256").update(s).digest();

export async function POST(request: Request) {
  const form = await request.formData();
  const typed = String(form.get("pin") ?? "");
  const appPin = process.env.APP_PIN;
  const key = clientKey(request.headers.get("x-forwarded-for"));
  const now = Date.now();

  // The limiter lives in the database. If the database is unreachable the PIN is still checked, just without the limit.
  let db: ReturnType<typeof serverDb> | null = null;
  let attempts = null as ReturnType<typeof parseAttempts>;
  try {
    db = serverDb();
    const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
    attempts = parseAttempts(data?.value);
  } catch {
    db = null;
  }

  if (lockStatus(attempts, now).locked) return NextResponse.redirect(new URL("/login?error=locked", request.url), 303);

  // Constant-time comparison of fixed-length fingerprints, so the time taken says nothing about how close a guess was.
  const ok = Boolean(appPin) && timingSafeEqual(sha(typed), sha(appPin as string));

  if (!ok) {
    if (db) {
      try {
        await db.from("app_settings").upsert({ key, value: JSON.stringify(afterFailure(attempts, now)), updated_at: new Date().toISOString() }, { onConflict: "key" });
      } catch {
        /* the limiter is best effort */
      }
    }
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  if (db && attempts) {
    try { await db.from("app_settings").delete().eq("key", key); } catch { /* best effort */ }
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(PIN_COOKIE, await pinToken(appPin as string), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
