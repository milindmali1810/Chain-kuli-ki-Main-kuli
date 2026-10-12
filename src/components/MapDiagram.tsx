import { LAYOUT, layoutFlow, type Flow } from "@/lib/mapDiagram";

// Draws one flow as an SVG: actors down the side, the six flow columns across, coloured boxes joined by dashed arrows.
// The colours live in a <style> inside the SVG itself, so the same drawing also works as a standalone .svg file, and
// follows light or dark mode through prefers-color-scheme.

const STYLE = `
text { font-family: system-ui, -apple-system, "Segoe UI", Arial, Helvetica, sans-serif; }
.md-text { fill: #1c2a40; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.md-muted { fill: #52627a; }
.md-line { stroke: #c9d3e2; stroke-width: 1.2; }
.md-edge { stroke: #6b7a90; stroke-width: 1.6; stroke-dasharray: 5 4; fill: none; }
.md-arrow { fill: #6b7a90; }
.md-box { stroke-width: 1.6; }
.md-t0 .md-box { fill: #eceff1; stroke: #90a4ae; } .md-t0 text { fill: #263238; }
.md-t1 .md-box { fill: #ece6fb; stroke: #7e57c2; } .md-t1 text { fill: #2d1b69; }
.md-t2 .md-box { fill: #dff5ee; stroke: #26a69a; } .md-t2 text { fill: #0d4a40; }
.md-t3 .md-box { fill: #e1effc; stroke: #42a5f5; } .md-t3 text { fill: #0d3c6e; }
.md-t4 .md-box { fill: #fdf0d6; stroke: #f9a825; } .md-t4 text { fill: #6b4a00; }
.md-t5 .md-box { fill: #fde6df; stroke: #ef7a5a; } .md-t5 text { fill: #7a2a14; }
.md-t6 .md-box { fill: #e6f4d9; stroke: #7cb342; } .md-t6 text { fill: #2d4a12; }
@media (prefers-color-scheme: dark) {
  .md-text { fill: #e6edf7; }
  .md-muted { fill: #a9b8cf; }
  .md-line { stroke: #31425c; }
  .md-edge { stroke: #8a99b0; }
  .md-arrow { fill: #8a99b0; }
  .md-t0 .md-box { fill: #2b3338; stroke: #78909c; } .md-t0 text { fill: #e0e6e9; }
  .md-t1 .md-box { fill: #2d2552; stroke: #9575cd; } .md-t1 text { fill: #e4dcff; }
  .md-t2 .md-box { fill: #123d38; stroke: #4db6ac; } .md-t2 text { fill: #d4f5ef; }
  .md-t3 .md-box { fill: #14355a; stroke: #64b5f6; } .md-t3 text { fill: #dcecfc; }
  .md-t4 .md-box { fill: #4a3410; stroke: #ffb74d; } .md-t4 text { fill: #ffeccc; }
  .md-t5 .md-box { fill: #4a2218; stroke: #ff8a65; } .md-t5 text { fill: #ffe0d6; }
  .md-t6 .md-box { fill: #243d14; stroke: #9ccc65; } .md-t6 text { fill: #e5f5d4; }
}`;

export function MapDiagram({ flow, id, standalone }: { flow: Flow; id: string; standalone?: boolean }) {
  const p = layoutFlow(flow);
  const L = LAYOUT;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${p.width} ${p.height}`}
      width={standalone ? p.width : undefined}
      height={standalone ? p.height : undefined}
      role="img"
      aria-label={`${flow.title}. ${flow.subtitle} Steps: ${flow.steps.map((s) => `${flow.actors[s.actor].name}: ${s.text}`).join("; ")}.`}
      style={standalone ? undefined : { width: "100%", height: "auto", display: "block" }}
    >
      <style>{STYLE}</style>
      <defs>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" className="md-arrow" />
        </marker>
      </defs>

      {/* column headings */}
      {p.headers.map((h) => (
        <text key={h.label} x={h.x} y={L.headH - 16} textAnchor="middle" fontSize="13.5" fontWeight="700" className="md-text">{h.label}</text>
      ))}
      <line x1={L.labelW} y1={L.headH - 4} x2={p.width - L.pad} y2={L.headH - 4} className="md-line" />
      <line x1={L.labelW - 1} y1={L.headH - 4} x2={L.labelW - 1} y2={p.height - L.pad} className="md-line" />

      {/* actors */}
      {p.rows.map((r) => (
        <g key={r.actor.name}>
          <text x={L.labelW - 18} y={r.y + L.rowH / 2 - 2} textAnchor="end" fontSize="14" fontWeight="700" className="md-text">{r.actor.name}</text>
          <text x={L.labelW - 18} y={r.y + L.rowH / 2 + 15} textAnchor="end" fontSize="11.5" className="md-text md-muted">{r.actor.kind}</text>
        </g>
      ))}

      {/* arrows first, so boxes sit on top */}
      {p.edges.map((e) => <path key={`${e.from}-${e.to}`} d={e.d} className="md-edge" markerEnd={`url(#${id}-arrow)`} />)}

      {/* steps */}
      {p.steps.map((s) => {
        const lineH = 15;
        const top = s.y + s.h / 2 - ((s.lines.length - 1) * lineH) / 2;
        return (
          <g key={s.id} className={`md-t${s.tone}`}>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="10" className="md-box" />
            <text textAnchor="middle" fontSize="12.5" fontWeight="600">
              {s.lines.map((line, i) => <tspan key={i} x={s.x + s.w / 2} y={top + i * lineH + 4}>{line}</tspan>)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
