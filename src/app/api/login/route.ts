import { NextResponse } from "next/server";
import { PIN_COOKIE, pinToken } from "@/lib/pin";

// The server checks the typed PIN against APP_PIN. The PIN never reaches the browser.
export async function POST(request: Request) {
  const form = await request.formData();
  const typed = String(form.get("pin") ?? "");
  const appPin = process.env.APP_PIN;

  if (!appPin || typed !== appPin) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(PIN_COOKIE, await pinToken(appPin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
