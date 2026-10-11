import { cookies } from "next/headers";
import { PIN_COOKIE, isValidToken } from "./pin";

// Server Actions can be called directly (not only through the pages), so every action checks the PIN itself.
export async function assertPin(): Promise<void> {
  const token = (await cookies()).get(PIN_COOKIE)?.value;
  if (!(await isValidToken(token, process.env.APP_PIN))) throw new Error("Not signed in");
}
