import { describe, expect, it } from "vitest";
import { AFTER_MATCH, BEFORE_MATCH, FLOW_COLUMNS, LAYOUT, layoutFlow, wrapText } from "../src/lib/mapDiagram";

describe("wrapText", () => {
  it("wraps on word boundaries and never splits a word", () => {
    const lines = wrapText("Predicts points, finds the best legal team", 19);
    expect(lines.every((l) => l.length <= 19)).toBe(true);
    expect(lines.join(" ")).toBe("Predicts points, finds the best legal team");
  });
  it("keeps a short sentence on one line", () => {
    expect(wrapText("Reviews, edits, confirms", 30)).toEqual(["Reviews, edits, confirms"]);
  });
});

describe.each([["before", BEFORE_MATCH], ["after", AFTER_MATCH]])("%s flow", (_n, flow) => {
  const placed = layoutFlow(flow);
  it("has valid references", () => {
    const ids = new Set(flow.steps.map((s) => s.id));
    expect(ids.size).toBe(flow.steps.length); // unique ids
    for (const [a, b] of flow.edges) { expect(ids.has(a)).toBe(true); expect(ids.has(b)).toBe(true); }
    for (const s of flow.steps) {
      expect(s.actor).toBeGreaterThanOrEqual(0);
      expect(s.actor).toBeLessThan(flow.actors.length);
      expect(s.column).toBeGreaterThanOrEqual(0);
      expect(s.column).toBeLessThan(FLOW_COLUMNS.length);
    }
  });
  it("never puts two boxes in the same cell", () => {
    const cells = flow.steps.map((s) => `${s.actor}:${s.column}`);
    expect(new Set(cells).size).toBe(cells.length);
  });
  it("moves forward in the flow: every arrow goes right or stays in its column", () => {
    const col = new Map(flow.steps.map((s) => [s.id, s.column]));
    for (const [a, b] of flow.edges) expect(col.get(b)!).toBeGreaterThanOrEqual(col.get(a)!);
  });
  it("keeps every box and every line of text inside the drawing", () => {
    for (const s of placed.steps) {
      expect(s.x).toBeGreaterThanOrEqual(LAYOUT.labelW);
      expect(s.x + s.w).toBeLessThanOrEqual(placed.width);
      expect(s.y + s.h).toBeLessThanOrEqual(placed.height);
      expect(s.lines.length).toBeLessThanOrEqual(3); // a box fits three lines
    }
  });
  it("draws one path per edge", () => {
    expect(placed.edges).toHaveLength(flow.edges.length);
    expect(placed.edges.every((e) => e.d.startsWith("M "))).toBe(true);
  });
});
