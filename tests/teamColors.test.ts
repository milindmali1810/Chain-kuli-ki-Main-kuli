import { describe, expect, it } from "vitest";
import { badgeStyle, contrast, teamColors, textOn } from "../src/lib/teamColors";

const KNOWN_TEAMS = [
  "India", "Australia", "England", "Pakistan", "Sri Lanka", "Bangladesh", "South Africa", "New Zealand", "West Indies", "Afghanistan",
  "Zimbabwe", "Ireland", "Scotland", "Netherlands", "Nepal", "United Arab Emirates", "Oman", "United States of America", "Canada",
  "Namibia", "Hong Kong", "Malaysia", "Singapore", "Japan", "Chennai Super Kings", "Mumbai Indians", "Royal Challengers Bengaluru",
  "Kolkata Knight Riders", "Delhi Capitals", "Sunrisers Hyderabad", "Rajasthan Royals", "Punjab Kings", "Gujarat Titans", "Lucknow Super Giants",
];

describe("teamColors", () => {
  it("knows the main sides, ignoring case", () => {
    expect(teamColors("India").code).toBe("IND");
    expect(teamColors("  west INDIES ").code).toBe("WI");
    expect(teamColors("Mumbai Indians").code).toBe("MI");
  });
  it("gives an unlisted team the same calm colours every time", () => {
    const a = teamColors("Meghalaya"), b = teamColors("Meghalaya");
    expect(a).toEqual(b);
    expect(a.a).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.b).toMatch(/^#[0-9a-f]{6}$/);
    expect(teamColors("Mizoram").a).not.toBe(a.a);
  });
  it("makes sensible short codes for unlisted names", () => {
    expect(teamColors("Papua New Guinea").code).toBe("PNG");
    expect(teamColors("Meghalaya").code).toBe("MEG");
  });
  it("keeps the two colours of each side visibly different", () => {
    for (const t of KNOWN_TEAMS) expect(teamColors(t).a.toLowerCase()).not.toBe(teamColors(t).b.toLowerCase());
  });
});

describe("badge letters stay readable", () => {
  it("darkens a bright pink just enough, and leaves good colours alone", () => {
    const pink = badgeStyle("#E91E8C");
    expect(pink.bg).not.toBe("#E91E8C");
    expect(contrast(pink.fg, pink.bg)).toBeGreaterThanOrEqual(4.5);
    expect(badgeStyle("#1F2430").bg).toBe("#1F2430");
  });
  it("every known side and a sample of unlisted ones: letters pass 4.5 to 1 on the badge colour (a side's main colour)", () => {
    const sample = [...KNOWN_TEAMS, "Meghalaya", "Mizoram", "Tamil Nadu", "Kenya", "Rwanda", "Austria", "Romania", "Bahrain", "Qatar", "Kuwait", "Thailand"];
    for (const t of sample) {
      const c = teamColors(t);
      const b = badgeStyle(c.a); // the second colour is only used in the stripe, which has no text
      expect(contrast(b.fg, b.bg), `${t} ${c.a}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("picks white on dark and near-black on light", () => {
    expect(textOn("#1F2430")).toBe("#ffffff");
    expect(textOn("#F2C318")).toBe("#111827");
  });
});
