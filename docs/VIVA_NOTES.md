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
