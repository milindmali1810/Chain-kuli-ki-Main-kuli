import { describe, it, expect } from "vitest";
import { teamScore } from "@/lib/teamScore";

describe("teamScore", () => {
  // Players 1..3 score 10, 20, 30. Captain 3 (2x), vice 2 (1.5x).
  // Base 10 + 20 + 30 = 60; captain extra 30 x (2 - 1) = 30; vice extra 20 x (1.5 - 1) = 10; total 100.
  const pts = new Map([[1, 10], [2, 20], [3, 30]]);

  it("sums the team and adds the captain's and vice-captain's extras: 60 + 30 + 10 = 100", () => {
    expect(teamScore(pts, [1, 2, 3], 3, 2)).toBe(100);
  });

  it("a player who did not play counts as 0, even as captain", () => {
    // Captain 9 did not play: base 60, captain extra 0, vice extra 10 -> 70
    expect(teamScore(pts, [1, 2, 3], 9, 2)).toBe(70);
  });

  it("no captain or vice-captain: just the sum", () => {
    expect(teamScore(pts, [1, 2, 3], null, null)).toBe(60);
  });

  it("negative scores work the same way: captain on -4 loses 4 more", () => {
    expect(teamScore(new Map([[1, -4], [2, 10]]), [1, 2], 1, 2)).toBe(-4 + 10 + -4 + 5);
  });
});
