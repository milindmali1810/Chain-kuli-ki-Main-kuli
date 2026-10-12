import { badgeStyle, teamColors } from "@/lib/teamColors";

// Two overlapping circles with each side's short code, in its colour. Decorative: the teams are always named in text next
// to it, so it is hidden from screen readers. The letters are always readable (see badgeStyle).
export function TeamBadges({ a, b }: { a: string; b: string }) {
  return (
    <span className="badges" aria-hidden="true">
      {[a, b].map((name) => {
        const c = teamColors(name);
        const s = badgeStyle(c.a);
        return <span key={name} className="badge" style={{ background: s.bg, color: s.fg }}>{c.code}</span>;
      })}
    </span>
  );
}
