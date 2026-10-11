import { NextResponse } from "next/server";
import { PIN_COOKIE } from "@/lib/pin";

// Clears the PIN cookie and returns to the PIN screen.
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(PIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
