import Link from "next/link";
import { Icon } from "@/components/icons";
import { CAPTAIN_INTRO, CAPTAIN_STEPS } from "@/lib/captainRules";

export const metadata = { title: "Guide" };

const STEPS = [
  { title: "1. Gather", text: "Years of real match data (men's international T20s, the IPL and the Syed Mushtaq Ali Trophy) from Cricsheet, plus weather from Open-Meteo, in a private database. A free fixture feed tells the agent which matches are coming up." },
  { title: "2. Score", text: "A points calculator turns any player's match into Dream11 points, using a points table stored as data, not buried in code." },
  { title: "3. Predict", text: "For each player the agent estimates points mainly from his recent matches, with small adjustments for the ground and his team's form. It only uses matches played before the one being predicted." },
  { title: "4. Pick", text: "Plain code searches for the best legal team of 11 within 100 credits and the team and role limits, then chooses the captain and vice-captain. A separate rules checker confirms the team is valid." },
  { title: "5. Explain", text: "Gemini Flash writes the reasons. It only receives numbers the code produced, and a checker throws away any sentence containing a number that is not in those facts." },
  { title: "6. Learn", text: "After a match you type in the points your team scored. The agent compares them with what it predicted and makes a small, undoable correction for the next match." },
];

const LIMITS = [
  "Credits are the agent's own estimates, not Dream11's, because Dream11 publishes no free credit data. Each one is labelled.",
  "The playing XI is a prediction from each side's last five matches. The real XI is announced at the toss and no free source publishes it, so change a player yourself if he is missing.",
  "How good is it? On past matches the agent's picks beat a random legal team by a small but real margin. Most of that comes from plain recent form. The Learning screen shows the numbers and how sure they are.",
  "Team rules use the strict reading (at most 7 players per side, 1-4 keepers, 3-6 batters, 1-4 all-rounders, 3-6 bowlers). A team valid under the strict rules is valid under the looser reading too.",
  "The points table is likely right (a second source agrees) but is not confirmed against Dream11 itself.",
  "Not used because the data is unavailable: batter against bowler type, spin against pace, batting order.",
  "Afghanistan matches are withheld by the data source, and there is no Indian first-class data (Ranji, Duleep).",
];

function Section({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="more" open={open}>
      <summary>{title}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export default function GuidePage() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Guide</h1>
        <p className="muted">How to use the app, and how it works, in plain English.</p>
      </div>

      <Section title="How to use it" open>
        <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          <li><strong>Open the next match.</strong> The agent has already picked a team. Tap a player to see why he was picked, and read the captain and vice-captain reasons.</li>
          <li><strong>Keep it or change it.</strong> Press <strong>Confirm my team</strong> if you are happy. To change something, open <strong>Change players, captain or vice-captain</strong>: the screen keeps checking the rules and tells you in plain English if a change breaks one. The number in front of each player is his credits. When you remove a player, the list of replacements opens with players who cost the <strong>same credits</strong> first, so the team still adds up to 100. You can edit until the match starts, then it is locked. You then enter the team in Dream11 yourself.</li>
          <li><strong>After the match, enter your points.</strong> Open <strong>After the match: enter the points your team scored</strong>. Change only the players whose Dream11 points differ from the pre-filled numbers, type the team total Dream11 shows, and save. The agent then learns from them for the next match.</li>
        </ol>
      </Section>

      <div className="banner info" role="note">
        <Icon name="info" />
        <p><strong>The one rule that matters:</strong> code picks and checks, Gemini only explains. The AI never chooses a player and never checks a rule.</p>
      </div>

      <Section title="How a recommendation is made">
        <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p className="muted" style={{ marginTop: 2 }}>{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="How the captain and vice-captain are chosen">
        <p className="muted">{CAPTAIN_INTRO}</p>
        <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {CAPTAIN_STEPS.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p className="muted" style={{ marginTop: 2 }}>{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Reading a match">
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          <li><strong>C</strong> and <strong>VC</strong> mark the captain (2x points) and vice-captain (1.5x points).</li>
          <li>The number beside a player is the points the agent expects from him. Tap him for the reason and his recent scores, oldest to newest.</li>
          <li>On a match already played, the bars compare <strong>Predicted</strong> (outlined) with <strong>Actual</strong> (solid).</li>
          <li><strong>Final</strong> is built from the confirmed playing XI; <strong>Provisional</strong> from predicted XIs. Switch between them under &ldquo;More about this team&rdquo;.</li>
          <li>The team score adds the 11 players&apos; points plus the captain&apos;s and vice-captain&apos;s extras, the same way for predicted and actual.</li>
        </ul>
      </Section>

      <Section title="What to keep in mind">
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </Section>

      <Link href="/guide/map" className="more-link">Open the components map (every part, from trigger to output)</Link>
    </div>
  );
}
