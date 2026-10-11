import { describe, it, expect } from "vitest";
import { ROLES, RULES_PROFILES, FEATURE_FLAGS } from "@/config/rules";
import { POINTS_PROFILES, DEFAULT_POINTS_PROFILE } from "@/config/points";
import { DEFAULT_RULES_PROFILE } from "@/config/rules";

// Walks any config object and collects every { value, source, status } label found.
function labels(node: unknown, path = "root"): { path: string; label: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap((x, i) => labels(x, `${path}[${i}]`));
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("value" in obj && "status" in obj) return [{ path, label: obj }];
    return Object.entries(obj).flatMap(([k, v]) => labels(v, `${path}.${k}`));
  }
  return [];
}

const STATUSES = ["certain", "likely", "guessing", "conflict", "unverified"];

describe("config data", () => {
  it("every rules and points value carries a source and a valid status", () => {
    const all = [
      ...labels(RULES_PROFILES, "rules"),
      ...labels(POINTS_PROFILES, "points"),
      ...labels(FEATURE_FLAGS, "flags"),
    ];
    expect(all.length).toBeGreaterThan(50);
    for (const { path, label } of all) {
      expect(typeof label.source, `${path} has no source`).toBe("string");
      expect((label.source as string).length, `${path} has an empty source`).toBeGreaterThan(0);
      expect(STATUSES, `${path} has a bad status`).toContain(label.status);
    }
  });

  it("defaults are strict rules and standard points", () => {
    expect(DEFAULT_RULES_PROFILE).toBe("strict");
    expect(DEFAULT_POINTS_PROFILE).toBe("standard");
  });

  it("strict is at least as tight as loose everywhere, so a strict-valid team is loose-valid", () => {
    const s = RULES_PROFILES.strict;
    const l = RULES_PROFILES.loose;
    expect(s.maxPerTeam.value).toBeLessThanOrEqual(l.maxPerTeam.value);
    for (const role of ROLES) {
      expect(s.roleLimits[role].min.value).toBeGreaterThanOrEqual(l.roleLimits[role].min.value);
      expect(s.roleLimits[role].max.value).toBeLessThanOrEqual(l.roleLimits[role].max.value);
    }
  });

  it("strict matches the locked values", () => {
    const s = RULES_PROFILES.strict;
    expect([s.teamSize.value, s.creditCap.value, s.maxPerTeam.value]).toEqual([11, 100, 7]);
    expect(ROLES.map((r) => [s.roleLimits[r].min.value, s.roleLimits[r].max.value])).toEqual([
      [1, 4], [3, 6], [1, 4], [3, 6],
    ]);
    expect([s.captainMultiplier.value, s.viceCaptainMultiplier.value]).toEqual([2, 1.5]);
  });

  it("backups are off by default", () => {
    expect(FEATURE_FLAGS.backups.enabled.value).toBe(false);
  });
});
