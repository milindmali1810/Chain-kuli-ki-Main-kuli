// Turns the PIN into a fingerprint (SHA-256 hash) so the browser cookie
// never contains the PIN itself. Uses Web Crypto, which works in both the
// proxy and normal server code.

export const PIN_COOKIE = "d11_auth";

export async function pinToken(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`dream11-optimizer:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Fail closed: if APP_PIN is missing or empty, nobody is let in.
export async function isValidToken(
  token: string | undefined,
  appPin: string | undefined,
): Promise<boolean> {
  if (!token || !appPin) return false;
  return token === (await pinToken(appPin));
}
