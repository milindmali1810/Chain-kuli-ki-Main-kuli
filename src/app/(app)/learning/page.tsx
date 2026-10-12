import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import type { GroupStat } from "@/lib/calibration";
import { ROLE_LABEL, formatDate, num } from "@/lib/format";
import { getLearning, type LearningView } from "@/lib/learning";
import { acceptChanges, checkForPatterns, chooseLearningMode, rejectChanges, undoLastChange } from "./actions";

export const metadata = { title: "Learning" };

const PITCH_LABEL: Record<string, string> = { HIGH_SCORING: "High-scoring pitch", LOW_SCORING: "Low-scoring pitch", NEUTRAL: "Neutral pitch" };

function BiasChip({ bias }: { bias: number }) {
  const r = Math.round(bias);
  if (r === 0) return <span className="chip">On target</span>;
  return r > 0
    ? <span className="chip warn">Over-predicts by {r}</span>
    : <span className="chip info">Under-predicts by {-r}</span>;
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
                <td><BiasChip bias={s.bias} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EdgeCard({ v }: { v: LearningView }) {
  const rows = v.versions.filter((x) => x.edge);
  if (rows.length === 0) return null;
  const sign = (n: number) => (n > 0 ? "+" : "") + num(n, 1);
  return (
    <section className="card stack" aria-labelledby="edge-h">
      <h2 id="edge-h">Does the agent&apos;s team beat simple alternatives?</h2>
      <p className="muted">
        For each past match we compare the real points of the 11 players the agent picked with two simple yardsticks, in points per player. Any legal team has to
        fit 100 credits and the role limits, which pulls it <strong>below</strong> the average player, so the fair yardstick is a <strong>random legal team</strong>.
        A gap smaller than about twice the margin (±) could just be luck.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th scope="col">Version</th><th scope="col">Matches</th><th scope="col">Agent&apos;s picks</th><th scope="col">Random legal team</th><th scope="col">Average player</th><th scope="col">Better than random by</th><th scope="col">Won in</th></tr>
          </thead>
          <tbody>
            {rows.map((ver) => {
              const e = ver.edge!;
              const clear = Math.abs(e.vsRandom) > 2 * e.vsRandomSe;
              return (
                <tr key={ver.id}>
                  <th scope="row">#{ver.id}</th>
                  <td className="num">{e.matches}</td>
                  <td className="num">{num(e.pickedAvg, 1)}</td>
                  <td className="num">{num(e.randomAvg, 1)}</td>
                  <td className="num">{num(e.fieldAvg, 1)}</td>
                  <td><span className={`chip ${clear ? (e.vsRandom > 0 ? "good" : "bad") : ""}`}><span className="num">{sign(e.vsRandom)}</span>&nbsp;(±{num(e.vsRandomSe, 1)})</span></td>
                  <td className="num">{e.winsVsRandom} of {e.matches}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Proposals({ v }: { v: LearningView }) {
  const enough = v.allMetrics.n >= v.settings.minRows;
  return (
    <section className="card stack" aria-labelledby="prop-h">
      <h2 id="prop-h">Proposed changes</h2>
      {v.pending.length === 0 ? (
        <p className="muted">
          {!enough
            ? `Not enough evidence yet. The agent needs about ${v.settings.minRows} compared players before it proposes anything; there are ${v.allMetrics.n}.`
            : v.rowsUnderActive === 0
              ? "The current rubric version has no compared matches yet. Re-run the backtests, then check for patterns."
              : "No consistent errors found right now, so there is nothing to change."}
        </p>
      ) : (
        <>
          <p className="muted">The agent noticed these patterns. Nothing changes until you accept. A change moves a value by at most 20% at a time.</p>
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {v.pending.map((p) => (
              <li key={p.id} className="card" style={{ background: "var(--surface-2)" }}>
                <p><strong>{p.plainEnglish}</strong></p>
                <p className="muted num">Correction factor {p.oldValue} → {p.newValue}</p>
              </li>
            ))}
          </ul>
          <div className="row">
            <form action={acceptChanges}><button type="submit" className="btn primary">Accept and create a new version</button></form>
            <form action={rejectChanges}><button type="submit" className="btn">Reject</button></form>
          </div>
        </>
      )}
      <form action={checkForPatterns}>
        <button type="submit" className="btn">Look for patterns now</button>
      </form>
    </section>
  );
}

function ModeCard({ v }: { v: LearningView }) {
  const active = v.versions.find((x) => x.id === v.activeVersionId);
  return (
    <section className="card stack" aria-labelledby="mode-h">
      <h2 id="mode-h">How the agent learns</h2>
      <p className="muted">
        Every time you save a match&apos;s points, the agent compares what it predicted with what happened. It only learns from matches it predicted under its
        <strong> current</strong> version, so a match is never counted twice, and the next match always uses the latest version.
      </p>
      <form action={chooseLearningMode} className="row">
        <div className="seg" role="group" aria-label="Learning mode">
          <button type="submit" name="mode" value="auto" aria-pressed={v.mode === "auto"} data-on={v.mode === "auto"}>Automatic</button>
          <button type="submit" name="mode" value="ask" aria-pressed={v.mode === "ask"} data-on={v.mode === "ask"}>Ask me first</button>
        </div>
      </form>
      <p>
        {v.mode === "auto"
          ? "Automatic: after you save points, the agent applies a small correction by itself (half of what the data suggests, never more than 20% at a time, and only once it has seen at least 3 matches). Every change is a new version you can undo."
          : "Ask me first: the agent only proposes changes below. Nothing changes until you accept."}
      </p>
      <p className="muted">
        Real Dream11 points you have entered so far: <span className="num">{v.realDream11Rows}</span> {v.realDream11Rows === 1 ? "player" : "players"}. The rest of the comparison uses points calculated from the scorecard.
      </p>
      {v.canUndo && active && (
        <div className="card" style={{ background: "var(--surface-2)" }}>
          <p><strong>Current version #{active.id}.</strong> {active.reason}</p>
          <form action={undoLastChange} style={{ marginTop: 8 }}>
            <button type="submit" className="btn">Undo this change</button>
          </form>
        </div>
      )}
    </section>
  );
}

async function LearningView() {
  await connection(); // read live data per visit; never run this while the app is being built
  const v = await getLearning();
  const m = v.allMetrics;

  if (m.n === 0) {
    return (
      <div className="stack-lg">
        <ModeCard v={v} />
        <div className="card empty">
          <h2>Nothing to learn from yet</h2>
          <p className="muted">Once a match has predicted and actual points, the agent compares them here.</p>
        </div>
      </div>
    );
  }

  const overall = m.overall!;
  return (
    <div className="stack-lg">
      <ModeCard v={v} />
      <div className="metrics">
        <div className="metric"><span className="v num">{m.matches}</span><span className="lbl">Matches compared</span></div>
        <div className="metric"><span className="v num">{m.n}</span><span className="lbl">Players compared</span></div>
        <div className="metric"><span className="v num">{num(overall.mae, 1)}</span><span className="lbl">Average error per player (points)</span></div>
        <div className="metric"><span className="v num">{overall.bias > 0 ? "+" : ""}{num(overall.bias, 1)}</span><span className="lbl">{overall.bias > 0 ? "Over-prediction" : "Under-prediction"} per player (points)</span></div>
      </div>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p>
          Average error is how far off a prediction is, ignoring direction. Over-prediction means the agent expected more points than players scored.
          {m.captainRegret.mean !== null && <> The captain pick scored {num(m.captainRegret.mean, 0)} points less, on average, than the best player in the same team.</>}
        </p>
      </div>

      <EdgeCard v={v} />

      <Proposals v={v} />

      <div className="stack-lg">
        <GroupTable title="Where it is wrong: by role" labelOf={(k) => ROLE_LABEL[k] ?? k} groups={m.byRole} />
        <GroupTable title="Where it is wrong: by pitch type" labelOf={(k) => PITCH_LABEL[k] ?? k} groups={m.byPitch} />
      </div>

      <section className="stack" aria-labelledby="ver-h">
        <h2 id="ver-h">Versions and accuracy</h2>
        <p className="muted">Each accepted change creates a new version. Every prediction records the version that made it, so you can compare accuracy before and after.</p>
        {v.versions.length > 1 && (
          <div className="banner" role="note">
            <Icon name="alert" />
            <p>
              A later version is first measured on the same matches the correction was learned from, so its improvement looks better than it will on new matches.
              The honest test is the next matches nobody has seen yet.
            </p>
          </div>
        )}
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Role corrections</th><th scope="col">Players</th><th scope="col">Average error</th><th scope="col">Error on the same matches as the first version</th><th scope="col">Direction</th></tr>
            </thead>
            <tbody>
              {v.versions.map((ver) => (
                <tr key={ver.id}>
                  <th scope="row">#{ver.id}</th>
                  <td><span className={`chip ${ver.status === "active" ? "good" : ""}`}>{ver.status}</span></td>
                  <td>{formatDate(ver.createdAt.slice(0, 10))}</td>
                  <td className="num">{Object.entries(ver.calibration).filter(([, c]) => c !== 1).map(([r, c]) => `${r} ×${c}`).join(", ") || "none"}</td>
                  <td className="num">{ver.metrics.n}</td>
                  <td className="num">{ver.metrics.overall ? num(ver.metrics.overall.mae, 1) : "n/a"}</td>
                  <td className="num">{ver.metricsSameMatches.overall ? num(ver.metricsSameMatches.overall.mae, 1) : "n/a"}</td>
                  <td>{ver.metrics.overall ? <BiasChip bias={ver.metrics.overall.bias} /> : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function LearningPage() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Learning</h1>
        <p className="muted">Where the agent is consistently wrong, and what it proposes to change. You decide.</p>
      </div>
      <Suspense fallback={<div className="stack-lg" aria-busy="true"><div className="skeleton" /><div className="skeleton" style={{ minHeight: 200 }} /></div>}>
        <LearningView />
      </Suspense>
    </div>
  );
}
