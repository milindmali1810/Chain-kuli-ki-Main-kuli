# Viva notes

Short, honest answers you can say in your own words. Each one names where to look in the code.

## The one-sentence version
"An agent that recommends a valid Dream11 team and a captain with specific reasons, then stores predicted vs actual points and proposes corrections where it is consistently wrong. Code decides and checks; Gemini only explains."

## Why is the AI not choosing the team?
- Selection and rules checking must be correct and repeatable. A language model can invent things. So code does it (`src/lib/selectTeam.ts`, `validateTeam.ts`), and the AI only writes text (`src/lib/reasoning.ts`).
- The selection is an exact search (branch and bound), tested against checking every combination (`tests/selectTeam.test.ts`).

## How do you stop Gemini inventing numbers?
- A guard in plain code (`src/lib/reasoning.ts`) rejects any sentence containing a number that is not in the facts the engine produced. A pick's sentence may only use that player's own numbers.
- Real cases found while building: it tried to subtract two scores itself (rejected), and an early version let "3 centuries" through because of a rounding rule (a test caught it, now fixed).
- A rejected sentence is replaced by a template built only from the numbers. Every run is logged in `ingestion_runs` (source `gemini-explain`).

## Are the rules hardcoded?
- No. Rules and points are data in `src/config/` and each value carries a source and a status (certain, likely, guessing, conflict, unverified).
- Sources disagreed on the per-team cap (7 or 10) and the role limits. The default is the strict reading, so any team it picks is valid under both.

## Where do the points come from? Are they Dream11's?
- The points table is from the Dream11 rules we found, and a second, independent source agrees (Sportskeeda, dated 2021). It is not confirmed against Dream11 itself. `docs/RULES_LOCKED.md` shows which values are certain and which are guesses.
- The scorer was checked by hand against a real scorecard (for example a bowler with 2 overs for 23 runs scores exactly 0).

## Are the credits real?
- No. Dream11 publishes no free credit data, and no API or free dataset exists. Credits are **seeded** from each player's recent fantasy points, ranked within the match, and labelled `seeded` everywhere. A real credit can replace any of them.

## Why a backtest? Isn't that cheating?
- Two things are shown: the live path (the agent finds upcoming matches and builds teams, which cannot be scored until the match is played) and backtests on matches already played, which give the evidence. No live match could be scored before the deadline. For a played match the system sees only data from before it (`src/lib/predict.ts` ignores any row dated on or after the match). Roles are inferred as of the match date too, so nothing leaks.
- Real scorecard points are computed with the same points table and shown beside the predictions.

## Can Aryan change the team? What happens at match time?
- Yes. The match screen has an editor (`src/app/(app)/matches/[id]/TeamEditor.tsx`): add or remove players, pick the captain and vice-captain, with live credits and rule feedback.
- The rules are checked by the same validator the agent's team goes through (`src/lib/editorLogic.ts` calls `validateTeam`), in the browser while editing and again on the server before saving (`team-actions.ts`). The server also re-loads players, roles and credits from the database and re-checks the lock time, so nothing the browser sends is trusted. I tested this by sending an invalid team straight to the server: it was refused and nothing was saved.
- Editing is open until the match starts, then locked. A match that has already been played is "practice": he can still edit and confirm a team to try the flow.
- The agent cannot submit to Dream11 (there is no official way), so Aryan enters the confirmed team in Dream11 himself.
- The live path is built: the agent finds the match from a fixture feed, builds the team about three days before, and Aryan keeps or edits it. Honest limit: the playing XI is a prediction from each side's last five matches, because no free source publishes the real XI; Aryan changes a player himself if one is missing. Credits are the agent's estimates unless he types real ones.

## What happens after the match?
- Aryan enters the points **his team** scored (the team he confirmed, or the agent's if he never edited it): the Dream11 points for each of his players, and the team total Dream11 shows. Only the values he changes are stored as real Dream11 points; the rest stay labelled as computed from the scorecard.
- The match screen and card show "Your team scored N". We also check our own calculation against the Dream11 total he typed: a match supports our points table, a difference points to a rule Dream11 scores differently. This is real evidence about the scorer, and we say so honestly if it differs.
- Limit: the learning loop compares predicted with actual for the players the agent recommended. Players Aryan added himself have no stored prediction, so they feed his team total but not the learning loop.

## How does it learn?
- It compares predicted with actual for every player in every final team and groups the errors by role and pitch type (`src/lib/calibration.ts`).
- If a role is consistently off, it **proposes** a correction factor, capped at 20% per step. Aryan accepts or rejects. Accepting creates a new rubric version; old predictions keep the version that made them.
- Honest limit: the first improvement is measured on the same matches the correction came from, so it is optimistic. The Learning screen says so. The fair test is new matches.
- **Automatic mode (the default).** When Aryan saves a match's points, the agent re-runs the comparison straight away and, if the evidence is there, applies a correction as a new rubric version for the next match. Safeguards: it needs at least 3 compared matches and 20 players; it applies only half of what the data suggests, never more than 20% in one step; factors stay between 0.6 and 1.4; it learns only from matches predicted under the current version (so nothing is counted twice); every change is a new version and the Learning screen has an "Undo this change" button. A switch on the Learning screen changes it to "Ask me first" (proposals wait for Aryan).
- Why damped and capped: a self-updating loop can chase noise or its own selection effects. When I tested v1 to v2, bias did not shrink the way the in-sample numbers suggested, so I made automatic steps half-size and reversible rather than claim it is proven to improve. Only the plain TypeScript maths changes weights; Gemini is not involved in learning.

## Does it actually work? What is the evidence?
- Test: `npm run evaluate` replays 361 past men's T20Is (Dec 2025 to Oct 2026). For each match it predicts using ONLY data from before it, with the real playing XIs, then compares with the real points. Settings are chosen on the older 312 matches and confirmed on the newest 49, so a setting is not judged on the matches it was fitted to.
- Yardstick: any legal team must fit 100 credits and the role limits, which pulls it BELOW the average player. So the fair comparison is a random legal team, not the plain average. Numbers are points per player against the average player of the match (margin of error about +-0.4 over all 361).
  - Random legal team: -1.7. Buy the most expensive stars: -0.8. Plain recent form: +0.5. **The agent: +0.8 to +1.1.**
  - So the agent beats a random legal team by about 2.5 to 2.8 points per player (roughly 25 to 30 per team before the captain bonus), well outside the margin of error.
- Honest limits to say out loud: (1) most of the skill is recent form; venue, team form and the death-over rule add little (turning them off changes the result by less than the margin of error); (2) predictions rank players only moderately (rank correlation about 0.26); (3) it over-predicts whole-team scores, so the predicted-vs-actual gap on one match is large (cricket is noisy); (4) credits are estimates, not Dream11's, which affects who can be picked; (5) the tests are men's internationals only, and many are associate-nation matches with thin history.
- The first version of the learning loop made things WORSE: its role corrections were learned from only 16 matches and made the agent under-predict by 2.8 points per player. The bigger test showed this, so version 4 resets them. That is the loop working as designed (versioned, undoable) and also the reason automatic learning is damped and capped.
- Version 4 (13 Oct 2026) = original rules with recent form weighted 0.2 instead of 0.4 and the corrections reset. It was best on the older matches (+1.1) and still above the original on the newest (+0.8 against +0.3). The gain is small and not proven; do not oversell it.

## What does the data cover, and what is missing?
- Men's T20 internationals since 2021, the IPL, and the Syed Mushtaq Ali Trophy (Cricsheet), plus weather (Open-Meteo). Upcoming fixtures come from the CricAPI feed (an official API; Cricbuzz and Cricinfo forbid scraping).
- Missing: Afghanistan matches (Cricsheet withholds them), women's matches, and Indian first-class cricket (Ranji, Duleep, Irani). Cricsheet does not carry first-class Indian data, and I found no official free BCCI feed. First-class numbers are also a weak guide to T20 fantasy points.

## What did the model not use?
- Batter vs bowler-type matchups, spin vs pace, batting order effects: the data is unavailable. Every prediction lists these as "unavailable" instead of inventing them.

## Security
- The app is behind a PIN checked on the server (constant-time comparison); the cookie holds a hash, not the PIN. Five wrong PINs from one address pause that address for 15 minutes, so the 10,000 possible 4-digit PINs cannot simply be tried one by one. A longer PIN would be stronger still.
- Standard browser headers are set (no framing, no content sniffing). The daily job route needs a secret that only Vercel's scheduler has.
- The database is locked with Row Level Security and no public access; only the server key can read or write, and that key never reaches the browser.
- Every server action re-checks the PIN, because actions can be called directly.
- Keys were pasted into a chat during the build and should be regenerated after submission.

## What I would do next
- A real toss-time trigger when a source for the announced XI exists (the daily job already finds matches and builds teams).
- An automatic daily refresh of the match history, so the newest results are always included (today it is re-ingested by hand).
- More backtested matches so the learning loop has stronger evidence, and a proper hold-out test.
- Real Dream11 credits and points from screenshots of the app, to settle the unverified rules.
- Indian domestic first-class data if a legitimate source appears.

## If something goes wrong in the viva
- If a page is slow the first time, Supabase was asleep: refresh once.
- If the live link redirects to the PIN screen, sign in again.
- Everything is in the repo, and `npm test` runs the 340+ tests offline.
