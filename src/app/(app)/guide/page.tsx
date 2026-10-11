import { Icon } from "@/components/icons";

export const metadata = { title: "Guide" };

const STEPS = [
  { title: "1. Gather", text: "Five years of real match data (international T20s, the IPL and Syed Mushtaq Ali Trophy) from Cricsheet, plus weather from Open-Meteo. All of it sits in a private database." },
  { title: "2. Score", text: "A points calculator turns any player's match into Dream11 points, using a points table that is stored as data, not buried in code." },
  { title: "3. Predict", text: "For each player the agent estimates points from his recent matches, adjusted for the ground, his team's recent form, and whether he bowls the death overs. It only uses matches played before the one being predicted." },
  { title: "4. Pick", text: "Plain code searches for the best legal team of 11 within 100 credits and the team and role limits, then chooses the captain and vice-captain. The search is exact, and a separate rules checker confirms the team is valid." },
  { title: "5. Explain", text: "Gemini Flash writes the reasons. It only receives numbers the code produced, and a checker throws away any sentence containing a number that is not in those facts." },
  { title: "6. Compare", text: "After the match, real points sit beside the predicted ones. Aryan can type in the real Dream11 points. The Learning screen shows where the agent is consistently wrong and proposes a correction, which only takes effect if he accepts it." },
];

const LIMITS = [
  "Credits are seeded, not Dream11's own, because Dream11 publishes no free credit data. Every seeded credit is labelled.",
  "Team rules default to the strict reading (at most 7 players per side, 1-4 keepers, 3-6 batters, 1-4 all-rounders, 3-6 bowlers). Sources disagree with a looser reading, and a team valid under the strict rules is valid under both.",
  "The points table is likely right (a second source agrees) but is not confirmed against Dream11 itself.",
  "The demo matches have already been played. Each prediction uses only data from before the match, which is a fair test.",
  "Not used because the data is unavailable: batter against bowler type, spin against pace, batting order.",
  "Afghanistan matches are withheld by the data source, and there is no Indian first-class data.",
];

export default function GuidePage() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Guide</h1>
        <p className="muted">How the optimizer works, in plain English.</p>
      </div>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p><strong>The one rule that matters:</strong> code picks and checks, Gemini only explains. The AI never chooses a player and never checks a rule.</p>
      </div>

      <section className="stack" aria-labelledby="how-h">
        <h2 id="how-h">How a recommendation is made</h2>
        <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {STEPS.map((s) => (
            <li key={s.title} className="card">
              <h3>{s.title}</h3>
              <p className="muted" style={{ marginTop: 4 }}>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="stack" aria-labelledby="read-h">
        <h2 id="read-h">Reading a match</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          <li><strong>Final</strong> is built from the confirmed playing XI. <strong>Provisional</strong> is built before the toss from predicted XIs, so some players may not play.</li>
          <li><strong>Predicted</strong> bars are outlined and <strong>Actual</strong> bars are solid. The numbers are printed beside them.</li>
          <li><strong>C</strong> and <strong>VC</strong> mark the captain (2x points) and vice-captain (1.5x points).</li>
          <li>Tap a player to see why he was picked and his most recent scores, oldest to newest.</li>
          <li>The team score adds the 11 players&apos; points plus the captain&apos;s and vice-captain&apos;s extras, the same way for predicted and actual.</li>
        </ul>
      </section>

      <section className="stack" aria-labelledby="limits-h">
        <h2 id="limits-h">What to keep in mind</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </section>
    </div>
  );
}
