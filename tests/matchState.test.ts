import { describe, expect, it } from "vitest";
import { dayLabel, matchState, relativeStart } from "../src/lib/matchState";

const now = new Date("2026-10-13T08:00:00Z"); // 1:30 pm IST on 13 Oct
const live = { live: true, startUtc: "2026-10-14T14:00:00Z", hasTeam: true, confirmed: false, hasActual: false };

describe("matchState", () => {
  it("backtests are simply played", () => {
    expect(matchState({ ...live, live: false, hasActual: true }, now).key).toBe("played");
  });
  it("no team yet: the action is to build it", () => {
    const s = matchState({ ...live, hasTeam: false }, now);
    expect(s.key).toBe("no-team");
    expect(s.step).toBe(1);
  });
  it("team ready but not confirmed: review", () => {
    expect(matchState(live, now)).toMatchObject({ key: "review", tone: "info", step: 1 });
  });
  it("confirmed by Aryan", () => {
    expect(matchState({ ...live, confirmed: true }, now)).toMatchObject({ key: "confirmed", tone: "good", step: 2 });
  });
  it("after the start it asks for his points, and 'played' once points exist", () => {
    const started = { ...live, startUtc: "2026-10-13T07:00:00Z" };
    expect(matchState(started, now)).toMatchObject({ key: "started", step: 3, action: "Enter your points" });
    expect(matchState({ ...started, hasActual: true }, now).key).toBe("played");
  });
});

describe("relativeStart", () => {
  it("speaks in minutes, hours and days", () => {
    expect(relativeStart("2026-10-13T08:40:00Z", now)).toBe("in 40 min");
    expect(relativeStart("2026-10-13T13:30:00Z", now)).toBe("in 5 h");
    expect(relativeStart("2026-10-17T08:00:00Z", now)).toBe("in 4 days");
    expect(relativeStart("2026-10-13T07:59:00Z", now)).toBe("started");
  });
});

describe("dayLabel", () => {
  it("counts days in Indian time", () => {
    expect(dayLabel("2026-10-13T15:00:00Z", now)).toBe("Today");
    expect(dayLabel("2026-10-14T13:30:00Z", now)).toBe("Tomorrow");
    expect(dayLabel("2026-10-17T13:30:00Z", now)).toBe("Sat 17 Oct");
  });
  it("a late-evening UTC time can already be tomorrow in India", () => {
    expect(dayLabel("2026-10-13T20:00:00Z", now)).toBe("Tomorrow"); // 1:30 am IST on 14 Oct
  });
});
