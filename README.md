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
player and never checks a rule. The Claude API is not used anywhere in the product. A guard in plain code rejects any
sentence whose numbers are not in the facts the engine produced, and plain templates replace rejected sentences.

Rules and points tables are **data** (`src/config/`), each value tagged with its source and how sure we are
(certain / likely / guessing / conflict / unverified). The default team rules are the strict profile (max 7 per side,
WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6): a team valid under it is valid under the looser reading too.

## What you can do in the app

- **Matches:** cards with predicted vs actual team score for each backtested match.
- **Match view:** Final (confirmed XI) and Provisional (predicted XI) teams, rules check, credits, pitch and weather, paired predicted/actual bars, the reason for every pick, the captain and vice-captain reasons, and, after the match, a form to enter the points your team scored (per player and the team total Dream11 shows), checked against our own calculation.
- **Edit and confirm my team:** start from the agent's team, swap players, choose the captain and vice-captain, with credits and rules checked live in plain English (the same validator as the agent's team, checked again on the server before saving). Editable until the match starts; matches already played are practice.
- **Learning:** where the agent is consistently wrong (by role and pitch type), proposed corrections that Aryan accepts or rejects, and accuracy per rubric version.
- **Data:** roles for players the agent would not guess. **Guide:** how it works, plus the [Components map](docs/COMPONENTS_MAP.md).

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
npm run explain -- --match 1529230           # Gemini writes the reasons; a guard checks every number
npm run calibrate                            # find consistent errors and store proposals for Aryan to accept
npm run gen:map                              # regenerate docs/COMPONENTS_MAP.md
```

More documents: [viva notes](docs/VIVA_NOTES.md), [demo script](docs/DEMO_SCRIPT.md), [handoff](docs/HANDOFF.md), [design system](design-system/match-day-optimizer/MASTER.md).

## Honest limits

- **Dream11 credits are seeded, not real.** Dream11 publishes no free credit data, so credits are generated from each
  player's recent fantasy points, ranked within the match, and labelled `seeded` everywhere.
- **The demo is a backtest.** Predictions for a played match use only matches before it; real scorecard points are computed
  with the same points table and shown beside the predictions.
- **Not used (data unavailable):** batter vs bowler-type matchups, spin vs pace, batting order effects.
- **Coverage gaps:** Afghanistan matches are withheld by Cricsheet; no Indian first-class data; men's T20 only.
