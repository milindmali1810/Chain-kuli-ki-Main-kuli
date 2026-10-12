# ARCHITECTURE.md — Dream11 Match Day Optimizer (Aryan)

Status: built and deployed (updated 13 Oct 2026). Build deadline EOD 12 Oct 2026; viva 15 Oct 2026.
Hard rule from the exam booklet: ALL runtime AI = Gemini Flash. No Claude API. Deploy on Vercel; Supabase storage; GitHub repo; Components Map (swimlane: actors as rows; Trigger, Input, Context, Processing, AI, Output as columns; see `docs/components-map.svg`).

## 1. Flow (what really runs)
1. **Find matches.** Vercel's scheduler calls `/api/cron/fixtures` every morning (08:00 IST), and the "Look for new matches" button does the same on demand. `src/lib/fixtureSync.ts` reads the CricAPI series list and the matches of the few series running now or soon, keeps upcoming T20s whose two teams belong to one league we have history for (men's internationals, IPL, Syed Mushtaq Ali), and saves them with their exact start time. No scraping: Cricbuzz forbids bots and Cricinfo blocks scripts.
2. **Build the team** (for matches starting within 3 days; `src/lib/livePipeline.ts`, same engine as the backtest). The predicted XI is each side's last five matches in the same league; credits are seeded estimates unless Aryan typed real ones; `predict()` estimates points; `selectTeam()` finds the best legal 11 and `chooseCaptains()` the captain and vice-captain; `validateTeam()` checks every rule.
3. **Explain.** `src/lib/explainMatch.ts` sends Gemini Flash the engine's numbers; a guard in `src/lib/reasoning.ts` rejects any sentence containing a number that is not in those facts and plain templates replace it.
4. **Review.** The Vercel app (Next.js, behind a PIN) reads Supabase on the server only. Aryan opens the match, keeps or edits the team (the validator re-checks live and again on the server), and enters the team in Dream11 himself.
5. **After the match.** Aryan enters the points his team scored. `src/lib/learning.ts` compares predicted with actual and, in Automatic mode, applies a small correction as a new rubric version (half-size steps, capped, undoable). Gemini is never involved in learning.
6. **Evidence.** `scripts/evaluate.ts` replays many past matches using only earlier data and compares the agent with baselines; `scripts/run-backtest.ts` stores the same comparison per match (`fieldStats`) for the Learning screen.

## 2. Predicted vs confirmed XI
`predicted_xi(source = predicted | confirmed, confidence)`. The agent builds the predicted XI. No free feed publishes the real XI, so a confirmed XI exists only if Aryan ticks it on the "Change the playing XI" page; with both XIs confirmed the "final" stage is built, otherwise "provisional".

## 3. Data sources
- **Cricsheet** (free, open): ball-by-ball history; the basis for form, venue effects and team form. Re-run `npm run ingest:cricsheet` to bring the history up to date.
- **CricAPI (cricketdata.org)**: upcoming fixtures only. Free plan 100 calls a day; one run uses about 12.
- **Open-Meteo**: observed weather for backtests (a future match shows "unavailable").
- **Gemini Flash**: reasons text only.
- **Manual**: roles (Data screen), real credits, real Dream11 points.
- **Not available free**: Dream11 credits and ownership, the announced playing XI, Indian first-class data.

## 4. Data model (Supabase, row-level security on every table, no public policies)
leagues, teams, players, manual_overrides, venues, matches (`data_origin` ingested | manual; `external_id` for feed matches; `cricsheet_match_id` = Cricsheet number or `live-<id>`), squads, predicted_xi, match_context, player_stats, player_phase_stats, player_vs_player, venue_stats, team_form, player_match_lines, credits (source manual | seeded), rubric_versions (parent_id chain, one active), recommendations (`engine_notes_json` holds validation, credits source, `fieldStats`), recommendation_players, user_teams, actual_points (source dream11_manual | computed_from_scorecard), calibration_runs, pending_adjustments, ingestion_runs, app_settings (learning mode, sign-in attempts). Migrations 001 to 005 are in `supabase/migrations`.

## 5. Rubric
Parameters live in `src/config/rubric.ts` as data with a source and status. Version 4 (current): recent-form weight 0.2, role corrections neutral. Evidence and the full story are in `docs/VIVA_NOTES.md`.

## 6. Screens (behind a shared PIN)
Matches (next match, coming up, past matches), Match (team, captain, keep or change, enter points, more), Learning (verdict, learning mode, suggestions, details), Data, Guide, Components map, plus "Change the playing XI" and "Add a match by hand" as optional pages.

## 7. Security
PIN checked on the server (constant-time), 5 wrong tries pause an address for 15 minutes, the cookie holds a hash, every server action re-checks the PIN, the scheduler route needs `CRON_SECRET`, the secret database key never reaches the browser, standard browser headers are set (`next.config.ts`).

## 8. Integration
- GitHub: repo; pushes to main deploy to Vercel automatically.
- Vercel: serves the app, runs the daily job (`vercel.json`), holds the environment variables.
- Supabase: Postgres, locked to the server key.
- Gemini Flash: the only runtime AI.
- Claude Code: build-time only.

## 9. Known gaps
No toss-time feed (XI is predicted); history needs a manual re-ingest to stay current; credits are estimates; future-match weather unavailable; Indian first-class, women's and other leagues not covered.
