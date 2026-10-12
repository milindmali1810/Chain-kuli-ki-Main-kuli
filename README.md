# Dream11 Match Day Optimizer

A fantasy cricket helper for "Aryan" (Mesa C4 AI final exam, Hard level). The agent **finds the next match by itself**, builds a
**valid** Dream11 team with a captain and vice-captain and real cricket reasons, lets Aryan keep or change it, and after the
match learns from the points he enters. It stores **predicted vs actual** points so it can see where it is consistently wrong.

- **Live app:** https://chain-kuli-ki-main-kuli.vercel.app (PIN protected; the PIN is given in the submission note)
- **Stack:** Next.js (TypeScript) on Vercel, Supabase (Postgres), Gemini Flash for the written reasons only
- **Data:** Cricsheet open ball-by-ball data (men's T20 internationals, IPL, Syed Mushtaq Ali Trophy), Open-Meteo weather, and the CricAPI fixture feed for upcoming matches

## The design rule that matters

**Code picks and checks; Gemini only explains.** Team selection (an exact search), the rules validator, the points
calculator and the learning maths are plain TypeScript. Gemini Flash receives the engine's numbers and writes the explanation
text. It never picks a player and never checks a rule. The Claude API is not used anywhere in the product. A guard in plain
code rejects any sentence whose numbers are not in the facts the engine produced, and plain templates replace rejected sentences.

Rules and points tables are **data** (`src/config/`), each value tagged with its source and how sure we are
(certain / likely / guessing / conflict / unverified). The default team rules are the strict profile (max 7 per side,
WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6): a team valid under it is valid under the looser reading too.

## How it works for Aryan

1. **The agent finds the match.** A daily job (08:00 IST) and a "Look for new matches" button read the fixture feed and list
   upcoming T20 matches (men's internationals, IPL, Syed Mushtaq Ali). About three days before a match the agent builds a team.
2. **Review.** The home page shows the next match with one button. The match page shows the agent's team, a reason for every
   pick, and the captain and vice-captain reasons.
3. **Keep or change.** One tap confirms the team. Players, captain and vice-captain can be changed, with credits and rules
   checked live (the same validator as the agent's team, checked again on the server). Editable until the match starts.
4. **After the match.** Aryan enters the points his team scored (and the team total Dream11 shows). The agent compares them with
   its prediction and, in Automatic mode, makes a small, numbered, undoable correction for the next match.
5. **Evidence.** The Learning screen shows whether the agent's picks beat a random legal team, how it is doing by role and pitch
   type, and every rubric version. Past matches (backtests) show predicted vs actual team scores.

Other screens: **Data** (roles the agent would not guess) and **Guide** (how it works, and the visual
[Components map](docs/components-map.svg) / [PNG](Component-Map.png), also at `/guide/map`).

## Folders

| Folder | What is in it |
|---|---|
| `src/config` | Team rules, points tables, rubric parameters, role-inference settings (all data) |
| `src/lib` | Validator, scorer, expected-points model, selection engine, prediction pipeline, fixture finder, learning loop, sign-in guard |
| `src/app` | The PIN screen, the web pages, the daily-job route (`/api/cron/fixtures`) |
| `scripts` | Jobs that run outside Vercel: ingestion, roles, weather, backtests, explanations, evaluation, rubric versions, map pictures |
| `supabase/migrations` | The database schema (row-level security on, no public access) and later changes |
| `tests` | Vitest tests with hand-worked examples (340+) |
| `docs` | Locked rules, rubric, architecture, handoff, viva notes, demo script, components map |

## Run it

```bash
npm install
npm test                    # unit tests, offline
npm run dev                 # the web app on http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in the values (names only are committed, never the keys):

| Name | What it is for |
|---|---|
| `APP_PIN` | The PIN that protects the app |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The database (the secret key stays on the server) |
| `GEMINI_API_KEY` | Gemini Flash, which writes the reasons |
| `CRICAPI_KEY` | The fixture feed (cricketdata.org, free plan: 100 calls a day) |
| `CRON_SECRET` | Lets only Vercel's scheduler call `/api/cron/fixtures` |

Data and maintenance jobs (need the Supabase secret key):

```bash
npm run ingest:cricsheet -- --dataset t20s   # also: --dataset ipl, --dataset sma. Run again to bring the history up to date
npm run infer:roles -- --before 2026-10-06
npm run fetch:weather -- --match 1529230
npm run backtest -- --match 1529230          # predict a played match from earlier data, compare with the scorecard
npm run explain -- --match 1529230           # Gemini writes the reasons; a guard checks every number
npm run sync:fixtures                        # find upcoming matches and build their teams (add -- --sample to test offline)
npm run evaluate -- --matches 520 --variants all   # replay many past matches against baselines (about 35 minutes)
npm run rubric:set -- --reason "Why" form.recentWeight=0.2   # record a tuned setting as a new, undoable version
npm run calibrate                            # find consistent errors and store proposals for Aryan to accept
npm run gen:map                              # regenerate docs/COMPONENTS_MAP.md
npm run gen:map-svg && npm run gen:map-png   # regenerate the map pictures
```

More documents: [architecture](docs/ARCHITECTURE.md), [viva notes](docs/VIVA_NOTES.md), [demo script](docs/DEMO_SCRIPT.md), [handoff](docs/HANDOFF.md), [design system](design-system/match-day-optimizer/MASTER.md).

## Honest limits

- **Dream11 credits are estimates, not real.** Dream11 publishes no free credit data, so credits are generated from each
  player's recent fantasy points, ranked within the match, and labelled everywhere. A credit Aryan types is used as real.
- **The playing XI is a prediction.** It comes from each side's last five matches. The real XI is announced at the toss and no free
  source publishes it, so Aryan changes a player himself if one is missing.
- **How good is it?** On 361 past internationals the agent's picks beat a random legal team by about 2.5 points per player; most
  of that comes from plain recent form (see the Learning screen and `docs/VIVA_NOTES.md` for the numbers and the margin of error).
- **Not used (data unavailable):** batter vs bowler-type matchups, spin vs pace, batting order effects.
- **Coverage gaps:** Afghanistan matches are withheld by Cricsheet; no Indian first-class data (Ranji, Duleep); women's matches
  and other leagues are not covered.
