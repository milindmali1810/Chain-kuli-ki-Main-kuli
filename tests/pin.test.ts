import { describe, it, expect } from "vitest";
import { isValidToken, pinToken } from "@/lib/pin";

describe("PIN token", () => {
  it("accepts the token made from the right PIN", async () => {
    expect(await isValidToken(await pinToken("1234"), "1234")).toBe(true);
  });

  it("rejects a token made from a wrong PIN", async () => {
    expect(await isValidToken(await pinToken("9999"), "1234")).toBe(false);
  });

  it("rejects everything when APP_PIN is not set", async () => {
    expect(await isValidToken(await pinToken("1234"), undefined)).toBe(false);
    expect(await isValidToken(await pinToken(""), "")).toBe(false);
  });

  it("rejects a missing cookie", async () => {
    expect(await isValidToken(undefined, "1234")).toBe(false);
  });

  it("never puts the PIN itself in the token", async () => {
    expect(await pinToken("1234")).not.toContain("1234");
  });
});
