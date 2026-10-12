import { describe, expect, it } from "vitest";
import { MAX_FAILS, WINDOW_MS, afterFailure, clientKey, lockStatus, parseAttempts } from "../src/lib/loginGuard";

const T = 1_000_000;

describe("lockStatus", () => {
  it("is open with no record", () => {
    expect(lockStatus(null, T).locked).toBe(false);
  });
  it("is open below the limit and locked at it", () => {
    expect(lockStatus({ fails: MAX_FAILS - 1, first: T }, T + 1000).locked).toBe(false);
    const s = lockStatus({ fails: MAX_FAILS, first: T }, T + 60_000);
    expect(s.locked).toBe(true);
    expect(s.minutesLeft).toBe(14);
  });
  it("opens again once the window has passed", () => {
    expect(lockStatus({ fails: 9, first: T }, T + WINDOW_MS).locked).toBe(false);
  });
});

describe("afterFailure", () => {
  it("counts up inside the window", () => {
    let e = afterFailure(null, T);
    expect(e).toEqual({ fails: 1, first: T });
    e = afterFailure(e, T + 1000);
    expect(e.fails).toBe(2);
    expect(e.first).toBe(T);
  });
  it("starts again after the window", () => {
    expect(afterFailure({ fails: 4, first: T }, T + WINDOW_MS + 1)).toEqual({ fails: 1, first: T + WINDOW_MS + 1 });
  });
  it("reaches the lock after MAX_FAILS wrong PINs", () => {
    let e = null as ReturnType<typeof afterFailure> | null;
    for (let i = 0; i < MAX_FAILS; i++) e = afterFailure(e, T + i);
    expect(lockStatus(e, T + MAX_FAILS).locked).toBe(true);
  });
});

describe("parseAttempts and clientKey", () => {
  it("reads a stored record and ignores rubbish", () => {
    expect(parseAttempts('{"fails":3,"first":5}')).toEqual({ fails: 3, first: 5 });
    expect(parseAttempts("nonsense")).toBeNull();
    expect(parseAttempts(null)).toBeNull();
    expect(parseAttempts('{"fails":"x"}')).toBeNull();
  });
  it("uses the first forwarded address and never an empty key", () => {
    expect(clientKey("203.0.113.5, 10.0.0.1")).toBe("login:203.0.113.5");
    expect(clientKey(null)).toBe("login:unknown");
    expect(clientKey("   ")).toBe("login:unknown");
  });
});
