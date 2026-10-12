import { describe, expect, it } from "vitest";
import { checkNewMatch, checkXI, istToUtcIso, parseCredit } from "../src/lib/liveMatch";

describe("parseCredit", () => {
  it("accepts half steps and blanks", () => {
    expect(parseCredit("9.5").value).toBe(9.5);
    expect(parseCredit(" 10 ").value).toBe(10);
    expect(parseCredit("")).toEqual({ value: null });
  });
  it("rejects text, odd steps and silly values", () => {
    expect(parseCredit("abc").error).toBeDefined();
    expect(parseCredit("9.3").error).toMatch(/0\.5/);
    expect(parseCredit("40").error).toBeDefined();
  });
});

describe("checkXI", () => {
  it("allows none ticked (before the toss)", () => {
    expect(checkXI([{ team: "A", ticked: 0 }, { team: "B", ticked: 0 }])).toEqual({ confirmed: false });
  });
  it("allows 11 and 11", () => {
    expect(checkXI([{ team: "A", ticked: 11 }, { team: "B", ticked: 11 }]).confirmed).toBe(true);
  });
  it("stops on 11 and 0, or 10", () => {
    expect(checkXI([{ team: "A", ticked: 11 }, { team: "B", ticked: 0 }]).error).toMatch(/B: you ticked 0/);
    expect(checkXI([{ team: "A", ticked: 10 }, { team: "B", ticked: 11 }]).error).toMatch(/A: you ticked 10/);
  });
});

describe("istToUtcIso", () => {
  it("converts Indian time to UTC", () => {
    expect(istToUtcIso("2026-10-14T19:30")).toBe("2026-10-14T14:00:00.000Z");
  });
  it("handles crossing midnight", () => {
    expect(istToUtcIso("2026-10-14T02:00")).toBe("2026-10-13T20:30:00.000Z");
  });
  it("rejects nonsense and impossible dates", () => {
    expect(istToUtcIso("tomorrow")).toBeNull();
    expect(istToUtcIso("2026-02-31T10:00")).toBeNull();
    expect(istToUtcIso("2026-10-14T25:00")).toBeNull();
  });
});

describe("checkNewMatch", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  const good = { teamA: "India", teamB: "Australia", venue: "Eden Gardens, Kolkata", startLocal: "2026-10-14T19:30" };
  it("accepts a future match", () => {
    const r = checkNewMatch(good, now);
    expect(r.ok).toBe(true);
    expect(r.startUtc).toBe("2026-10-14T14:00:00.000Z");
  });
  it("rejects the same team twice", () => {
    expect(checkNewMatch({ ...good, teamB: "India" }, now).errors.teamB).toMatch(/different/);
  });
  it("rejects a start time in the past", () => {
    expect(checkNewMatch({ ...good, startLocal: "2026-10-01T19:30" }, now).errors.startLocal).toMatch(/passed/);
  });
  it("asks for missing fields", () => {
    const r = checkNewMatch({ teamA: "", teamB: "", venue: "", startLocal: "" }, now);
    expect(Object.keys(r.errors).sort()).toEqual(["startLocal", "teamA", "teamB", "venue"]);
  });
});
