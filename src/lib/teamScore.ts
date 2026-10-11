import { DEFAULT_RULES_PROFILE, RULES_PROFILES, type RulesProfile } from "@/config/rules";

// One formula for a team's score, used for BOTH predicted and actual points so they can be compared fairly:
// the sum of the eleven players' points, plus the captain's extra (2x means one extra copy of his points)
// and the vice-captain's extra (1.5x means half a copy). A player who did not play has 0.
export function teamScore(
  pointsById: Map<number, number>,
  selectedIds: number[],
  captainId: number | null,
  viceCaptainId: number | null,
  rules: RulesProfile = RULES_PROFILES[DEFAULT_RULES_PROFILE],
): number {
  const pts = (id: number | null) => (id === null ? 0 : pointsById.get(id) ?? 0);
  const base = selectedIds.reduce((a, id) => a + pts(id), 0);
  const captainExtra = pts(captainId) * (rules.captainMultiplier.value - 1);
  const viceExtra = pts(viceCaptainId) * (rules.viceCaptainMultiplier.value - 1);
  return base + captainExtra + viceExtra;
}
