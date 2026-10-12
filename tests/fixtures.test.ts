import { describe, expect, it } from "vitest";
import { isT20, matchTeam, matchVenue, parseSeriesInfo, pickSeries, upcomingFromList } from "../src/lib/fixtures";

const now = new Date("2026-10-13T00:00:00Z");
const base = { id: "a1", name: "India vs Australia, 1st T20I", matchType: "t20", venue: "Eden Gardens, Kolkata", dateTimeGMT: "2026-10-14T14:00:00", teams: ["India", "Australia"], matchStarted: false, matchEnded: false };

describe("isT20", () => {
  it("trusts the type, and also the name (CricAPI labels some T20Is as odi)", () => {
    expect(isT20({ name: "Pakistan vs Sri Lanka, 3rd T20I, tour", matchType: "t20" })).toBe(true);
    expect(isT20({ name: "India vs West Indies, 4th T20I, West Indies tour of India, 2026", matchType: "odi" })).toBe(true);
  });
  it("rejects ODIs and Tests, even if the type says t20", () => {
    expect(isT20({ name: "India vs West Indies, 2nd ODI, tour", matchType: "odi" })).toBe(false);
    expect(isT20({ name: "Pakistan vs Sri Lanka, 1st Test, tour" })).toBe(false);
    expect(isT20({ name: "Sikkim vs Meghalaya, Plate", matchType: "test" })).toBe(false);
  });
});

describe("upcomingFromList", () => {
  it("keeps an upcoming T20 and reads the GMT time as UTC", () => {
    const r = upcomingFromList([base], now);
    expect(r).toHaveLength(1);
    expect(r[0].startUtc).toBe("2026-10-14T14:00:00.000Z");
    expect(r[0].teamA).toBe("India");
  });
  it("keeps a T20I whose type field is wrongly odi", () => {
    const r = upcomingFromList([{ ...base, id: "wi", name: "India vs West Indies, 4th T20I, West Indies tour of India, 2026", matchType: "odi" }], now);
    expect(r).toHaveLength(1);
  });
  it("drops other formats, started, ended, past, placeholder and malformed matches", () => {
    const r = upcomingFromList([
      { ...base, id: "odi", name: "India vs West Indies, 2nd ODI", matchType: "odi" },
      { ...base, id: "live", matchStarted: true },
      { ...base, id: "done", matchEnded: true },
      { ...base, id: "past", dateTimeGMT: "2026-10-01T14:00:00" },
      { ...base, id: "one", teams: ["India"] },
      { ...base, id: "tbc", teams: ["Tbc", ""] },
      { ...base, id: "notime", dateTimeGMT: undefined },
      { matchType: "t20" },
      null,
    ], now);
    expect(r).toEqual([]);
  });
  it("sorts by start time and survives a non-list", () => {
    const r = upcomingFromList([{ ...base, id: "late", dateTimeGMT: "2026-10-20T10:00:00" }, base], now);
    expect(r.map((f) => f.externalId)).toEqual(["a1", "late"]);
    expect(upcomingFromList(undefined, now)).toEqual([]);
  });
});

describe("parseSeriesInfo", () => {
  it("reads the match list inside data", () => {
    const r = parseSeriesInfo({ status: "success", data: { info: {}, matchList: [base] } }, now);
    expect(r.fixtures).toHaveLength(1);
  });
  it("reports a failure instead of pretending there are no matches", () => {
    expect(parseSeriesInfo({ status: "failure", reason: "hits limit reached" }, now).problem).toMatch(/hits limit/);
    expect(parseSeriesInfo(null, now).problem).toBeDefined();
  });
});

describe("pickSeries", () => {
  const row = (id: string, startDate: string, endDate: string, t20: number, matches: number) => ({ id, name: id, startDate, endDate, t20, matches });
  it("opens series that are running now or start soon, have T20s and published matches", () => {
    const ids = pickSeries([
      row("running", "2026-10-09", "Nov 21", 3, 6), // Sri Lanka tour of Pakistan
      row("soon", "2026-10-22", "Dec 01", 5, 12), // India tour of New Zealand
      row("far", "2026-12-09", "Dec 30", 3, 5),
      row("ended", "2026-09-01", "Sep 06", 3, 8),
      row("no-t20", "2026-10-11", "Mar 02", 0, 119), // Ranji Trophy
      row("not-published", "2026-10-16", "Oct 28", 3, 0),
      row("no-year", "Nov 14", "Nov 24", 16, 5),
    ], now);
    expect(ids).toEqual(["running", "soon"]);
  });
  it("handles an end date in the next year and a cap", () => {
    expect(pickSeries([row("bbl", "2026-12-12", "Jan 26", 44, 44)], now, { lookaheadDays: 90 })).toEqual(["bbl"]);
    const many = Array.from({ length: 12 }, (_, i) => row(`s${i}`, "2026-10-14", "Oct 30", 3, 3));
    expect(pickSeries(many, now, { max: 5 })).toHaveLength(5);
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
  it("picks the busier of two rows for the same ground in one city", () => {
    const dupes = [
      { id: 10, name: "Eden Park", city: "Auckland", matches: 4 },
      { id: 118, name: "Eden Park, Auckland", city: "Auckland", matches: 25 },
    ];
    expect(matchVenue("Eden Park, Auckland", dupes)).toBe(118);
  });
  it("matches the same ground spelled with an extra word", () => {
    const rows = [{ id: 94, name: "Rajiv Gandhi International Stadium, Uppal, Hyderabad", city: "Hyderabad" }, { id: 5, name: "Eden Gardens", city: "Kolkata" }];
    expect(matchVenue("Rajiv Gandhi International Stadium, Hyderabad", rows)).toBe(94);
  });
  it("refuses an ambiguous match", () => {
    const twins = [{ id: 1, name: "National Stadium", city: "Karachi" }, { id: 2, name: "National Stadium", city: "Dhaka" }];
    expect(matchVenue("National Stadium", twins)).toBeNull();
  });
});
