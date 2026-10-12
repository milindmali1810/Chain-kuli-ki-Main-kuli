import { connection } from "next/server";
import { Suspense } from "react";
import type { GroupStat } from "@/lib/calibration";
import { ROLE_LABEL, formatDate, num } from "@/lib/format";
import { getLearning, type LearningView } from "@/lib/learning";
import { acceptChanges, checkForPatterns, chooseLearningMode, rejectChanges, undoLastChange } from "./actions";

export const metadata = { title: "Learning" };

const PITCH_LABEL: Record<string, string> = { HIGH_SCORING: "High-scoring pitch", LOW_SCORING: "Low-scoring pitch", NEUTRAL: "Neutral pitch" };
const sign = (n: number) => (n > 0 ? "+" : "") + num(n, 1);

function BiasText({ bias }: { bias: number }) {
  const r = Math.round(bias);
  if (r === 0) return <span>On target</span>;
  return <span>{r > 0 ? `Over-predicts by ${r}` : `Under-predicts by ${-r}`}</span>;
}

function GroupTable({ title, labelOf, groups }: { title: string; labelOf: (k: string) => string; groups: Record<string, GroupStat> }) {
  const entries = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
  if (entries.length === 0) return null;
  return (
    <section className="stack" aria-label={title}>
      <h3>{title}</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th scope="col">Group</th><th scope="col">Players</th><th scope="col">Predicted</th><th scope="col">Actual</th><th scope="col">Average error</th><th scope="col">Direction</th></tr>
          </thead>
          <tbody>
            {entries.map(([k, s]) => (
              <tr key={k}>
                <th scope="row">{labelOf(k)}</th>
                <td className="num">{s.n}</td>
                <td className="num">{num(s.meanPredicted, 1)}</td>
                <td className="num">{num(s.meanActual, 1)}</td>
                <td className="num">{num(s.mae, 1)}</td>
                <td><BiasText bias={s.bias} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// The one question Aryan can ask here: is the agent any good? Answered in a sentence and three numbers.
function Verdict({ v }: { v: LearningView }) {
  const withEdge = v.versions.filter((x) => x.edge);
  const ver = withEdge.find((x) => x.id === v.activeVersionId) ?? withEdge[withEdge.length - 1];
  if (!ver?.edge) {
    return (
      <section className="card stack" aria-labelledby="verdict-h">
        <h2 id="verdict-h">How is the agent doing?</h2>
        <p className="muted">There are not enough past matches yet to say. Once played matches have been compared, the answer appears here.</p>
      </section>
    );
  }
  const e = ver.edge;
  const clear = Math.abs(e.vsRandom) > 2 * e.vsRandomSe;
  return (
    <section className="card stack" aria-labelledby="verdict-h">
      <h2 id="verdict-h">How is the agent doing?</h2>
      <p>
        On <span className="num">{e.matches}</span> past matches, the 11 players the agent picked scored <strong className="num">{sign(e.vsRandom)}</strong> points
        per player {e.vsRandom >= 0 ? "more" : "less"} than a randomly chosen legal team.{" "}
        {clear && e.vsRandom > 0 ? "That is a real edge, not luck." : "That gap is small enough that luck could explain it."}
      </p>
      <div className="three">
        <div className="metric"><span className="v num">{num(e.pickedAvg, 1)}</span><span className="lbl">The agent&apos;s picks</span></div>
        <div className="metric"><span className="v num">{num(e.randomAvg, 1)}</span><span className="lbl">A random legal team</span></div>
        <div className="metric"><span className="v num">{num(e.fieldAvg, 1)}</span><span className="lbl">The average player</span></div>
      </div>
      <p className="muted">Points per player, over past matches. A legal team must fit 100 credits and the role limits, which keeps any team below the average player, so a random legal team is the fair comparison.</p>
    </section>
  );
}

function Proposals({ v }: { v: LearningView }) {
  const enough = v.allMetrics.n >= v.settings.minRows;
  if (v.pending.length === 0) {
    return (
      <section className="card stack" aria-labelledby="prop-h">
        <h2 id="prop-h">Suggested changes</h2>
        <p className="muted">
          {!enough
            ? `Not enough evidence yet. The agent needs about ${v.settings.minRows} compared players before it suggests anything; there are ${v.allMetrics.n}.`
            : v.rowsUnderActive === 0
              ? "The current version has no compared matches yet."
              : "Nothing to change right now."}
        </p>
        <form action={checkForPatterns}><button type="submit" className="btn">Look for patterns now</button></form>
      </section>
    );
  }
  return (
    <section className="card stack" aria-labelledby="prop-h">
      <h2 id="prop-h">Suggested changes</h2>
      <p className="muted">The agent noticed these patterns. Nothing changes until you accept.</p>
      <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {v.pending.map((p) => (
          <li key={p.id}>
            <p><strong>{p.plainEnglish}</strong></p>
            <p className="muted num">Factor {p.oldValue} → {p.newValue}</p>
          </li>
        ))}
      </ul>
      <div className="row">
        <form action={acceptChanges}><button type="submit" className="btn primary">Accept</button></form>
        <form action={rejectChanges}><button type="submit" className="btn">Reject</button></form>
      </div>
    </section>
  );
}

function ModeCard({ v }: { v: LearningView }) {
  const active = v.versions.find((x) => x.id === v.activeVersionId);
  return (
    <section className="card stack" aria-labelledby="mode-h">
      <h2 id="mode-h">Learning from your points</h2>
      <p className="muted">
        When you save a match&apos;s points, the agent compares what it predicted with what happened.
        {v.mode === "auto"
          ? " In Automatic mode it then makes a small correction by itself. Every change is a numbered version you can undo."
          : " In Ask-me-first mode it only suggests changes, and nothing changes until you accept."}
      </p>
      <form action={chooseLearningMode} className="row">
        <div className="seg" role="group" aria-label="Learning mode">
          <button type="submit" name="mode" value="auto" aria-pressed={v.mode === "auto"} data-on={v.mode === "auto"}>Automatic</button>
          <button type="submit" name="mode" value="ask" aria-pressed={v.mode === "ask"} data-on={v.mode === "ask"}>Ask me first</button>
        </div>
      </form>
      {v.canUndo && active && (
        <div className="stack">
          <p className="muted"><strong>Current version #{active.id}.</strong> {active.reason}</p>
          <form action={undoLastChange}><button type="submit" className="btn">Undo this change</button></form>
        </div>
      )}
    </section>
  );
}

async function LearningView() {
  await connection(); // read live data per visit; never run this while the app is being built
  const v = await getLearning();
  const m = v.allMetrics;
  const overall = m.overall;

  return (
    <div className="stack-lg">
      <Verdict v={v} />
      <ModeCard v={v} />
      <Proposals v={v} />

      {m.n > 0 && overall && (
        <details className="more">
          <summary>Details: where it is wrong, and every version</summary>
          <div className="body">
            <div className="metrics">
              <div className="metric"><span className="v num">{m.matches}</span><span className="lbl">Matches compared</span></div>
              <div className="metric"><span className="v num">{m.n}</span><span className="lbl">Players compared</span></div>
              <div className="metric"><span className="v num">{num(overall.mae, 1)}</span><span className="lbl">Average error per player (points)</span></div>
              <div className="metric"><span className="v num">{overall.bias > 0 ? "+" : ""}{num(overall.bias, 1)}</span><span className="lbl">{overall.bias > 0 ? "Over-prediction" : "Under-prediction"} per player (points)</span></div>
            </div>
            <p className="muted">
              Average error is how far off a prediction is, ignoring direction. Over-prediction means the agent expected more points than players scored.
              {m.captainRegret.mean !== null && <> The captain pick scored {num(m.captainRegret.mean, 0)} points less, on average, than the best player in the same team.</>}
              {" "}Real Dream11 points you have entered: <span className="num">{v.realDream11Rows}</span>; the rest use points calculated from the scorecard.
            </p>

            <GroupTable title="By role" labelOf={(k) => ROLE_LABEL[k] ?? k} groups={m.byRole} />
            <GroupTable title="By pitch type" labelOf={(k) => PITCH_LABEL[k] ?? k} groups={m.byPitch} />

            <section className="stack" aria-label="Versions">
              <h3>Versions</h3>
              <p className="muted">Each change creates a numbered version. A later version is first measured on matches it learned from, so it looks better than it will on new matches.</p>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Role corrections</th><th scope="col">Players</th><th scope="col">Average error</th><th scope="col">Direction</th><th scope="col">Better than random by</th></tr>
                  </thead>
                  <tbody>
                    {v.versions.map((ver) => (
                      <tr key={ver.id}>
                        <th scope="row">#{ver.id}</th>
                        <td>{ver.status}</td>
                        <td>{formatDate(ver.createdAt.slice(0, 10))}</td>
                        <td className="num">{Object.entries(ver.calibration).filter(([, c]) => c !== 1).map(([r, c]) => `${r} ×${c}`).join(", ") || "none"}</td>
                        <td className="num">{ver.metrics.n}</td>
                        <td className="num">{ver.metrics.overall ? num(ver.metrics.overall.mae, 1) : "n/a"}</td>
                        <td>{ver.metrics.overall ? <BiasText bias={ver.metrics.overall.bias} /> : "n/a"}</td>
                        <td className="num">{ver.edge ? `${sign(ver.edge.vsRandom)} (±${num(ver.edge.vsRandomSe, 1)}) over ${ver.edge.matches}` : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </details>
      )}
    </div>
  );
}

export default function LearningPage() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Learning</h1>
        <p className="muted">Is the agent any good, and how does it improve?</p>
      </div>
      <Suspense fallback={<div className="stack-lg" aria-busy="true"><div className="skeleton" /><div className="skeleton" style={{ minHeight: 200 }} /></div>}>
        <LearningView />
      </Suspense>
    </div>
  );
}
