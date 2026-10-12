import { describe, expect, it } from "vitest";
import { spearman, summariseEdge } from "../src/lib/edge";

describe("spearman", () => {
  it("is 1 for the same order and -1 for the opposite", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });
  it("handles ties and too-short lists", () => {
    expect(spearman([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
    expect(spearman([1, 2], [1, 2])).toBe(0);
  });
});

describe("summariseEdge", () => {
  const m = (picked: number[], field: number[], pairs = [] as { predicted: number; actual: number }[]) => ({ picked, field, pairs });
  it("edge is picked average minus field average, averaged over matches", () => {
    const s = summariseEdge([m([50, 50], [40, 40, 40, 40]), m([30, 30], [40, 40, 40, 40])]);
    expect(s.edge).toBeCloseTo(0); // +10 and -10
    expect(s.wins).toBe(1);
    expect(s.matches).toBe(2);
    expect(s.pickedAvg).toBeCloseTo(40);
  });
  it("reports the standard error so noise is visible", () => {
    const s = summariseEdge([m([50], [40]), m([30], [40]), m([50], [40]), m([30], [40])]);
    expect(s.edge).toBeCloseTo(0);
    expect(s.se).toBeGreaterThan(0);
  });
  it("measures error and direction per player", () => {
    const s = summariseEdge([m([1], [1], [{ predicted: 50, actual: 40 }, { predicted: 30, actual: 40 }, { predicted: 60, actual: 40 }])]);
    expect(s.mae).toBeCloseTo((10 + 10 + 20) / 3);
    expect(s.bias).toBeCloseTo((10 - 10 + 20) / 3);
  });
  it("ignores matches with nothing picked", () => {
    expect(summariseEdge([m([], [40])]).matches).toBe(0);
  });
});
