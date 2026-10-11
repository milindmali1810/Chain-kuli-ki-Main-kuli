import { describe, it, expect } from "vitest";
import { DEFAULT_LEARNING, computeMetrics, proposeCalibration, type CompareRow } from "@/lib/calibration";

const row = (matchId: number, role: CompareRow["role"], predicted: number, actual: number, pitch = "NEUTRAL"): CompareRow => ({ matchId, role, predicted, actual, pitch });

describe("computeMetrics", () => {
  // Two batters: predicted 40 and 60, actual 20 and 30 -> mean predicted 50, mean actual 25, bias +25, MAE (20 + 30) / 2 = 25
  // One bowler: predicted 30, actual 45 -> bias -15, MAE 15
  const rows = [row(1, "BAT", 40, 20), row(1, "BAT", 60, 30, "HIGH_SCORING"), row(2, "BOWL", 30, 45)];
  const m = computeMetrics(rows, [10, 20]);

  it("counts rows and matches", () => {
    expect(m.n).toBe(3);
    expect(m.matches).toBe(2);
  });

  it("overall: mean predicted 43.33, mean actual 31.67, bias +11.67, MAE (20 + 30 + 15) / 3 = 21.67", () => {
    expect(m.overall!.meanPredicted).toBeCloseTo(43.333, 2);
    expect(m.overall!.meanActual).toBeCloseTo(31.667, 2);
    expect(m.overall!.bias).toBeCloseTo(11.667, 2);
    expect(m.overall!.mae).toBeCloseTo(21.667, 2);
  });

  it("by role: batters over-predicted by 25, bowlers under-predicted by 15", () => {
    expect(m.byRole.BAT).toMatchObject({ n: 2, meanPredicted: 50, meanActual: 25, bias: 25, mae: 25 });
    expect(m.byRole.BOWL).toMatchObject({ n: 1, bias: -15, mae: 15 });
  });

  it("by pitch type", () => {
    expect(Object.keys(m.byPitch).sort()).toEqual(["HIGH_SCORING", "NEUTRAL"]);
    expect(m.byPitch.HIGH_SCORING.n).toBe(1);
  });

  it("captain regret is the average of the regrets given", () => {
    expect(m.captainRegret).toEqual({ n: 2, mean: 15 });
  });

  it("no rows: no overall and no regret, never a made-up zero", () => {
    const empty = computeMetrics([]);
    expect(empty.overall).toBeNull();
    expect(empty.captainRegret.mean).toBeNull();
  });
});

describe("proposeCalibration", () => {
  const current = { WK: 1, BAT: 1, AR: 1, BOWL: 1 };
  const many = (role: CompareRow["role"], n: number, predicted: number, actual: number) => Array.from({ length: n }, (_, i) => row(i + 1, role, predicted, actual));

  it("proposes nothing before enough rows (the rubric's MIN_ROWS of 20)", () => {
    expect(proposeCalibration(computeMetrics(many("BAT", 19, 50, 25)), current)).toEqual([]);
  });

  it("proposes nothing for a role with too few rows of its own", () => {
    const rows = [...many("BAT", 20, 50, 50), ...many("BOWL", 5, 50, 10)];
    expect(proposeCalibration(computeMetrics(rows), current)).toEqual([]);
  });

  it("ignores small errors: 3% off is within the 5% dead zone", () => {
    expect(proposeCalibration(computeMetrics(many("BAT", 20, 50, 48.5)), current)).toEqual([]);
  });

  it("a 10% over-prediction proposes x0.9: predicted 50, actual 45 -> ratio 0.9", () => {
    const [p] = proposeCalibration(computeMetrics(many("BAT", 20, 50, 45)), current);
    expect(p).toMatchObject({ parameter: "calibration.BAT", role: "BAT", oldValue: 1, newValue: 0.9 });
    expect(p.evidence).toMatchObject({ n: 20, meanPredicted: 50, meanActual: 45, bias: 5 });
    expect(p.plainEnglish).toContain("10% lower");
  });

  it("one cycle moves a value by at most 20%: predicted 50, actual 10 would be x0.2 but is capped at x0.8", () => {
    const [p] = proposeCalibration(computeMetrics(many("BAT", 20, 50, 10)), current);
    expect(p.newValue).toBe(0.8);
  });

  it("under-prediction proposes a rise, also capped: predicted 20, actual 60 -> x1.2", () => {
    const [p] = proposeCalibration(computeMetrics(many("BOWL", 20, 20, 60)), current);
    expect(p.newValue).toBe(1.2);
    expect(p.plainEnglish).toContain("higher");
  });

  it("builds on the current value, not on 1: current 0.9 and a further 10% fall gives 0.81", () => {
    const [p] = proposeCalibration(computeMetrics(many("BAT", 20, 50, 45)), { ...current, BAT: 0.9 });
    expect(p.newValue).toBe(0.81);
  });

  it("proposes for each role that is consistently off and leaves accurate roles alone", () => {
    const rows = [...many("BAT", 10, 50, 40), ...many("BOWL", 10, 30, 30)];
    const ps = proposeCalibration(computeMetrics(rows), current);
    expect(ps.map((p) => p.role)).toEqual(["BAT"]);
  });

  it("the defaults match the rubric: 20 rows, 5% dead zone, 20% max step", () => {
    expect(DEFAULT_LEARNING).toMatchObject({ minRows: 20, minShift: 0.05, maxStep: 0.2 });
  });
});
