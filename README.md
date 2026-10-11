# Dream11 Match Day Optimizer

A fantasy cricket helper for "Aryan" (Mesa C4 AI final exam, Hard level). For a match it recommends a **valid** Dream11 team,
a captain and vice-captain with match-specific reasons, then stores **predicted vs actual** points so it can spot where it is
consistently wrong.

- **Live app:** https://chain-kuli-ki-main-kuli.vercel.app (PIN protected; the PIN is given in the submission note)
- **Stack:** Next.js (TypeScript) on Vercel, Supabase (Postgres), Gemini Flash for the written reasons only
- **Data:** Cricsheet open ball-by-ball data (T20 internationals, IPL, Syed Mushtaq Ali Trophy), Open-Meteo weather

## The design rule that matters

**Code picks and checks; Gemini only explains.** Team selection (an exact search), the rules validator and the points
calculator are plain TypeScript. Gemini Flash receives the engine's numbers and writes the explanation text. It never picks a
player and never checks a rule. The Claude API is not used anywhere in the product. (Status: the engine, validator and
scorer are built and tested; the Gemini explanation layer is the next milestone.)

Rules and points tables are **data** (`src/config/`), each value tagged with its source and how sure we are
(certain / likely / guessing / conflict / unverified). The default team rules are the strict profile (max 7 per side,
WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6): a team valid under it is valid under the looser reading too.

## Folders

| Folder | What is in it |
|---|---|
| `src/config` | Team rules, points tables, rubric parameters, role-inference settings (all data) |
| `src/lib` | Validator, scorer, Cricsheet translator, expected-points model, selection engine, prediction pipeline |
| `src/app` | The PIN screen and the web pages |
| `scripts` | Data jobs that run outside Vercel: ingestion, roles, weather, seeded credits, backtest |
| `supabase/migrations` | The database schema (24 tables, row-level security on, no public access) |
| `tests` | Vitest tests with hand-worked examples |
| `docs` | Locked rules, rubric, architecture, handoff notes |

## Run it

```bash
npm install
npm test                    # unit tests
npm run dev                 # the web app on http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in the values. Data jobs (need the Supabase secret key):

```bash
npm run ingest:cricsheet -- --dataset t20s   # also: --dataset ipl, --dataset sma
npm run infer:roles -- --before 2026-10-06
npm run fetch:weather -- --match 1529230
npm run backtest -- --match 1529230          # predict a played match from earlier data, compare with the scorecard
```

## Honest limits

- **Dream11 credits are seeded, not real.** Dream11 publishes no free credit data, so credits are generated from each
  player's recent fantasy points, ranked within the match, and labelled `seeded` everywhere.
- **The demo is a backtest.** Predictions for a played match use only matches before it; real scorecard points are computed
  with the same points table and shown beside the predictions.
- **Not used (data unavailable):** batter vs bowler-type matchups, spin vs pace, batting order effects.
- **Coverage gaps:** Afghanistan matches are withheld by Cricsheet; no Indian first-class data; men's T20 only.
