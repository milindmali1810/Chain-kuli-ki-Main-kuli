# Dream11 Match Day Optimizer: the whole build in one file

Built for "Aryan" (Mesa C4 AI final exam, Hard level). Build deadline 12 Oct 2026, viva 15 Oct 2026.

| | |
|---|---|
| **Live app** | https://chain-kuli-ki-main-kuli.vercel.app (PIN protected; the PIN goes in the submission note) |
| **GitHub (public)** | https://github.com/milindmali1810/Chain-kuli-ki-Main-Kuli |
| **Components map** | `Component-Map.png` (project folder), `docs/components-map.svg`, and in the app at Guide, then Components map |
| **Demo video** | `demo/Demo-Video.mp4` |
| **Stack** | Next.js (TypeScript) on Vercel, Supabase (Postgres), Gemini Flash for the written reasons only |

## 1. What it is, in one paragraph

An agent that **finds the next cricket match by itself**, builds a **valid Dream11 team** with a captain and vice-captain and real cricket reasons, lets Aryan **keep it or change it**, and after the match **learns from the points he enters**. Every prediction is stored next to what really happened, so the agent can see where it is consistently wrong and correct itself in small, numbered, undoable steps.

**The design rule everything is built around: code picks and checks; Gemini only explains.** Team selection (an exact search), the rules checker, the points calculator and the learning maths are plain TypeScript. Gemini Flash is the only AI at runtime, it receives numbers the code produced, and it only writes sentences. A guard in code throws away any sentence containing a number that is not in those facts. The Claude API is not used anywhere in the product.

## 2. How it works for Aryan

1. **The agent finds the match.** A daily job (08:00 IST) and a "Look for new matches" button read an official fixture feed (CricAPI) and list upcoming T20 matches: men's internationals, the IPL and the Syed Mushtaq Ali Trophy. About three days before a match, the agent builds a team.
2. **Review.** The home page shows the next match with one button. The match page shows the agent's team (one calm line per player), a reason for every pick, and the captain and vice-captain reasons.
3. **Keep or change.** One tap confirms the team. Or he changes players, the captain or the vice-captain, with credits and rules checked live in plain English (the same checker as the agent's team, run again on the server before saving). Editable until the match starts.
4. **After the match.** Aryan types the points his team scored and the team total Dream11 shows. Only the boxes he changes are saved as real Dream11 points. The agent compares them with its prediction and, in Automatic mode, makes a small correction for the next match.
5. **Evidence.** The Learning screen shows whether the agent's picks beat a random legal team, where it is wrong by role and pitch type, and every rubric version. Past matches show predicted against actual.

Screens: Matches (next match, coming up, past matches), Match, Learning, Data, Guide, Components map, plus two optional pages ("Change the playing XI", "Add a match by hand"). Light and dark mode, phone and laptop, soft sky-blue and cream palette, a faint cricket-ground background, and a thin team-colour stripe with badges for each match.

## 3. The method, in plain English

- **Expected points per player** come mostly from his recent matches (recent form weighted 0.2, a longer record 0.8), pulled toward his role's average when he has little history, with small adjustments for the ground and his team's recent form, and a rule that guarantees a death-overs bowler where the data shows one.
- **The team** is the exact best legal 11 within 100 credits and the team and role limits (a branch-and-bound search, tested against trying every combination). The captain and vice-captain are chosen by stated, repeatable cricket rules (reliability, batting position stand-ins, bowling quota).
- **Rules and points tables are data**, not code, each value tagged with its source and how sure we are (certain, likely, guessing, conflict, unverified). The default team rules are the strict reading, so any team it picks is valid under the looser reading too.
- **The playing XI** is predicted from each side's last five matches in the same league. **Credits** are the agent's own estimates (Dream11 publishes no free credit data) unless Aryan types real ones; each is labelled.
- **No peeking.** A prediction for a played match ignores every row dated on or after that match. Roles are inferred as of the match date too.

## 4. How it learns

- After points are saved, the agent compares predicted with actual for every player, groups the errors by role and pitch type, and proposes a per-role correction factor.
- **Automatic mode (default):** it applies half of what the data suggests, never more than 20% in one step, only after at least 3 matches and 20 players, within a safe range, as a **new numbered rubric version**. **Ask-first mode:** it only proposes. Every change can be undone on the Learning screen, and old predictions keep the version that made them.
- **What actually happened:** the first learned version (v2) learned from only 16 matches and made the agent under-predict by 2.8 points per player. A bigger test caught it. **Version 4 (active)** resets those corrections and weights recent form at 0.2, chosen on older matches and confirmed on newer ones. That is the loop working as designed, and the reason it is damped and reversible.

## 5. Evidence: does it work?

Tested on **previous played matches**, using only data from before each match:

- **361 past men's T20 internationals** (Dec 2025 to Oct 2026), replayed with `npm run evaluate`. Numbers are points per player against the average player of the match (margin of error about ±0.4):

| Strategy (same credit cap and role rules) | Result |
|---|---|
| Random legal team | −1.7 |
| Buy the most expensive stars | −0.8 |
| Plain recent form | +0.5 |
| **The agent** | **+0.8 to +1.1** |

  So the agent beats a random legal team by about **2.5 points per player** (roughly 25 to 30 per team before the captain bonus), well outside the margin of error. A second check on matches between the 8 established sides gave about +3.7; the 31 stored backtests shown in the app are the weakest sample (about +0.8, margin ±1.3) and are shown honestly.
- **31 played matches** are stored with predicted and actual points per player and per team, visible under Past matches.
- **Honest limits:** most of the skill is plain recent form; venue, team form and the death-over rule add very little. Predictions rank players only moderately (rank correlation about 0.26) and over-predict whole-team scores, so a single match can miss by a lot (cricket is noisy).

## 6. Data and coverage

- **Cricsheet** ball-by-ball (men's T20 internationals since 2021, the IPL, the Syed Mushtaq Ali Trophy): about 3,400 matches. Open-Meteo weather for played matches. CricAPI for upcoming fixtures only (an official API; Cricbuzz forbids bots and Cricinfo blocks scripts, so nothing is scraped).
- **Missing, and said so:** Afghanistan matches (withheld by Cricsheet), women's matches and other leagues, **Indian first-class data (Ranji, Duleep: no free official source)**, the announced playing XI and Dream11's own credits (no free source), future-match weather.

## 7. Security and quality

- PIN checked on the server (constant-time); 5 wrong tries pause an address for 15 minutes; the cookie holds a hash, not the PIN; every server action re-checks the PIN; the scheduled-job route needs a secret; the database is locked with row-level security and no public access; the secret key never reaches the browser; standard browser headers are set.
- **350 automated tests** pass. A full end-to-end audit (`docs/AUDIT.md`) found and fixed: guessable PIN, matches stuck at "upcoming", missing error pages and headers, missing database indexes, duplicate ground labels, stale documentation. A fresh clone of GitHub builds with no keys. No secrets are in the git history.

## 8. Honest limits (say them out loud)

Credits are estimates. The playing XI is a prediction. The points table is likely right (a second source agrees) but is not confirmed against Dream11 itself. The agent's edge is real but modest and mostly recent form. The match history lags the real world by the source's publishing delay (newest match 6 Oct). There is no Indian first-class data.

## 9. Run it

```bash
npm install
npm test                    # 350 tests, offline
npm run dev                 # http://localhost:3000
```

Environment names (values are never committed): `APP_PIN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRICAPI_KEY`, `CRON_SECRET`.

Main jobs: `ingest:cricsheet`, `infer:roles`, `fetch:weather`, `backtest`, `explain`, `sync:fixtures`, `evaluate`, `rubric:set`, `calibrate`, `gen:map`, `gen:map-svg`, `gen:map-png`.

## 10. Where things are

| Folder | What is in it |
|---|---|
| `src/config` | Rules, points tables, rubric parameters (all data with sources) |
| `src/lib` | Validator, scorer, prediction and selection engine, fixture finder, learning loop, sign-in guard, team colours |
| `src/app` | The PIN screen, all pages, the daily-job route |
| `scripts` | Ingestion, backtests, explanations, evaluation, rubric versions, map pictures |
| `supabase/migrations` | The database (5 migrations) |
| `tests` | The 350 tests |
| `docs` | Rules, rubric, architecture, handoff, viva notes, demo script, audit, components map |

Read next: `docs/VIVA_NOTES.md` (short honest answers), `docs/DEMO_SCRIPT.md`, `docs/ARCHITECTURE.md`, `docs/AUDIT.md`.
