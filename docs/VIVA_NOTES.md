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
- No live match was available before the deadline. For a played match the system sees only data from before it (`src/lib/predict.ts` ignores any row dated on or after the match). Roles are inferred as of the match date too, so nothing leaks.
- Real scorecard points are computed with the same points table and shown beside the predictions.

## Can Aryan change the team? What happens at match time?
- Yes. The match screen has an editor (`src/app/(app)/matches/[id]/TeamEditor.tsx`): add or remove players, pick the captain and vice-captain, with live credits and rule feedback.
- The rules are checked by the same validator the agent's team goes through (`src/lib/editorLogic.ts` calls `validateTeam`), in the browser while editing and again on the server before saving (`team-actions.ts`). The server also re-loads players, roles and credits from the database and re-checks the lock time, so nothing the browser sends is trusted. I tested this by sending an invalid team straight to the server: it was refused and nothing was saved.
- Editing is open until the match starts, then locked. A match that has already been played is "practice": he can still edit and confirm a team to try the flow.
- The agent cannot submit to Dream11 (there is no official way), so Aryan enters the confirmed team in Dream11 himself.
- Honest limit: a true live match also needs an upcoming match to be created, the confirmed XI at the toss, real credits and an exact start time. That path is not built yet; the engine already takes those as inputs.

## What happens after the match?
- Aryan enters the points **his team** scored (the team he confirmed, or the agent's if he never edited it): the Dream11 points for each of his players, and the team total Dream11 shows. Only the values he changes are stored as real Dream11 points; the rest stay labelled as computed from the scorecard.
- The match screen and card show "Your team scored N". We also check our own calculation against the Dream11 total he typed: a match supports our points table, a difference points to a rule Dream11 scores differently. This is real evidence about the scorer, and we say so honestly if it differs.
- Limit: the learning loop compares predicted with actual for the players the agent recommended. Players Aryan added himself have no stored prediction, so they feed his team total but not the learning loop.

## How does it learn?
- It compares predicted with actual for every player in every final team and groups the errors by role and pitch type (`src/lib/calibration.ts`).
- If a role is consistently off, it **proposes** a correction factor, capped at 20% per step. Aryan accepts or rejects. Accepting creates a new rubric version; old predictions keep the version that made them.
- Honest limit: the first improvement is measured on the same matches the correction came from, so it is optimistic. The Learning screen says so. The fair test is new matches.

## What does the data cover, and what is missing?
- Men's T20 internationals since 2021, the IPL, and the Syed Mushtaq Ali Trophy (Cricsheet), plus weather (Open-Meteo).
- Missing: Afghanistan matches (Cricsheet withholds them), women's matches, and Indian first-class cricket (Ranji, Duleep, Irani). Cricsheet does not carry first-class Indian data, and I found no official free BCCI feed. First-class numbers are also a weak guide to T20 fantasy points.

## What did the model not use?
- Batter vs bowler-type matchups, spin vs pace, batting order effects: the data is unavailable. Every prediction lists these as "unavailable" instead of inventing them.

## Security
- The app is behind a PIN checked on the server; the cookie holds a hash, not the PIN.
- The database is locked with Row Level Security and no public access; only the server key can read or write, and that key never reaches the browser.
- Every server action re-checks the PIN, because actions can be called directly.
- Keys were pasted into a chat during the build and should be regenerated after submission.

## What I would do next
- A real toss-time trigger and a scheduled job for live matches.
- More backtested matches so the learning loop has stronger evidence, and a proper hold-out test.
- Real Dream11 credits and points from screenshots of the app, to settle the unverified rules.
- Indian domestic first-class data if a legitimate source appears.

## If something goes wrong in the viva
- If a page is slow the first time, Supabase was asleep: refresh once.
- If the live link redirects to the PIN screen, sign in again.
- Everything is in the repo, and `npm test` runs the 230+ tests offline.
