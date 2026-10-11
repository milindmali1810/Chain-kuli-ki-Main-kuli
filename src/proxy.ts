import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PIN_COOKIE, isValidToken } from "@/lib/pin";

// Runs before every page. No valid PIN cookie means a redirect to /login.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(PIN_COOKIE)?.value;
  if (await isValidToken(token, process.env.APP_PIN)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Skip the login page, the login endpoint, and static files.
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
