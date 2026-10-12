import { describe, expect, it } from "vitest";
import { matchTeam, matchVenue, parseCricApiMatches } from "../src/lib/fixtures";

const now = new Date("2026-10-13T00:00:00Z");
const ok = (data: unknown[]) => ({ status: "success", data });
const base = { id: "a1", name: "India vs Australia, 1st T20I", matchType: "t20", venue: "Eden Gardens, Kolkata", dateTimeGMT: "2026-10-14T14:00:00", teams: ["India", "Australia"], matchStarted: false, matchEnded: false };

describe("parseCricApiMatches", () => {
  it("keeps an upcoming T20 and reads the GMT time as UTC", () => {
    const r = parseCricApiMatches(ok([base]), now);
    expect(r.fixtures).toHaveLength(1);
    expect(r.fixtures[0].startUtc).toBe("2026-10-14T14:00:00.000Z");
    expect(r.fixtures[0].teamA).toBe("India");
  });
  it("drops other formats, started, ended, past and malformed matches", () => {
    const r = parseCricApiMatches(ok([
      { ...base, id: "odi", matchType: "odi" },
      { ...base, id: "live", matchStarted: true },
      { ...base, id: "done", matchEnded: true },
      { ...base, id: "past", dateTimeGMT: "2026-10-01T14:00:00" },
      { ...base, id: "one", teams: ["India"] },
      { ...base, id: "notime", dateTimeGMT: undefined },
      { matchType: "t20" },
    ]), now);
    expect(r.fixtures).toEqual([]);
  });
  it("sorts by start time", () => {
    const r = parseCricApiMatches(ok([{ ...base, id: "late", dateTimeGMT: "2026-10-20T10:00:00" }, base]), now);
    expect(r.fixtures.map((f) => f.externalId)).toEqual(["a1", "late"]);
  });
  it("reports a failure instead of pretending there are no matches", () => {
    expect(parseCricApiMatches({ status: "failure", reason: "Invalid API Key" }, now).problem).toMatch(/Invalid API Key/);
    expect(parseCricApiMatches(null, now).problem).toBeDefined();
  });
});

describe("matchTeam", () => {
  const teams = [{ id: 1, name: "India" }, { id: 2, name: "United States of America" }, { id: 3, name: "United Arab Emirates" }];
  it("matches ignoring case and uses the few known aliases", () => {
    expect(matchTeam("india", teams)).toBe(1);
    expect(matchTeam("USA", teams)).toBe(2);
    expect(matchTeam("UAE", teams)).toBe(3);
  });
  it("does not guess", () => {
    expect(matchTeam("India Women", teams)).toBeNull();
    expect(matchTeam("Ind", teams)).toBeNull();
  });
});

describe("matchVenue", () => {
  const venues = [
    { id: 1, name: "Eden Gardens", city: "Kolkata" },
    { id: 2, name: "Wankhede Stadium", city: "Mumbai" },
    { id: 3, name: "Dubai International Cricket Stadium", city: "Dubai" },
  ];
  it("matches name and city text", () => {
    expect(matchVenue("Eden Gardens, Kolkata", venues)).toBe(1);
    expect(matchVenue("Wankhede Stadium", venues)).toBe(2);
  });
  it("matches when the feed adds words", () => {
    expect(matchVenue("Dubai International Cricket Stadium, Dubai, UAE", venues)).toBe(3);
  });
  it("returns null for unknown or missing grounds", () => {
    expect(matchVenue("Brand New Ground, Nowhere", venues)).toBeNull();
    expect(matchVenue(null, venues)).toBeNull();
  });
  it("refuses an ambiguous match", () => {
    const twins = [{ id: 1, name: "National Stadium", city: "Karachi" }, { id: 2, name: "National Stadium", city: "Dhaka" }];
    expect(matchVenue("National Stadium", twins)).toBeNull();
  });
});
