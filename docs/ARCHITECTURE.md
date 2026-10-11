# ARCHITECTURE.md — Dream11 Match Day Optimizer (Aryan)

Status: design agreed, no code yet. Deadline: build EOD 12 Oct 2026; viva 15 Oct 2026.
Hard rule from exam booklet: ALL runtime AI = Gemini Flash. No Claude API. Deploy on Vercel; Supabase storage; GitHub repo; Components Map (swimlane grid: actors as rows; Trigger, Input, Context, Processing, AI, Output as columns).
Scope: men's T20I only for the demo (league is a config field so others plug in later).

## 1. Flow
1. GitHub Actions cron (and a manual "Refresh" workflow) runs the ingestion script.
2. Ingestion pulls: fixtures, squads and profiles (Apify Cricbuzz or Cricinfo actor), historical ball-by-ball (Cricsheet download, open data), weather (free weather API), pitch-report text (Gemini Flash with search grounding, or a manual field). Writes everything to Supabase.
3. Derivation step computes: venue indices, player-vs-player, batter/bowler-type matchups, phase splits, death-bowler stats, team form index.
4. Selection engine (TypeScript, deterministic) builds predicted XIs and the recommended 11, C/VC and backups using the active rubric version. The validator rejects invalid teams.
5. Gemini Flash writes the reasoning text from the engine's numeric factors. It never picks players or checks validity.
6. The Vercel app reads Supabase only. Aryan opens a match and sees the prepared result. He edits, the validator re-checks live, he confirms and enters the team in Dream11 himself.
7. Post-match: the dashboard prompts Aryan for actual points; they are stored; a calibration job compares predicted and actual by role, venue type and player type, and proposes versioned weight changes. Aryan approves or rejects.
8. At toss (about 30 minutes before start): the job re-runs with the confirmed XI, toss result and updated weather.

## 2. Predicted vs confirmed XI
Predicted XI = last confirmed XI per team, adjusted by manual overrides (injuries, rest). Each row carries source = predicted | confirmed and a confidence. Confirmed replaces predicted and triggers re-selection.

## 3. Data sources (what each can and cannot do)
- Cricsheet (primary, free, open): ball-by-ball for T20Is and leagues; basis for head-to-head, phase splits, venue scoring, fielding. Freshness for recent matches to be tested in M2.
- Apify actors (supplementary): Cricinfo scraper (player career stats, venue aggregates, scorecards; needs a proxy), Cricbuzz scraper (fixtures, scorecards, series, player profiles). Terms-of-service risk: treat as optional enrichment.
- Weather API (free): temperature, humidity, rain chance, wind, cloud, dew point.
- Gemini Flash with search grounding: pitch report text and team news; manual field as fallback.
- Manual: credits, actual Dream11 points, boundary dimensions, batting hand and bowling type if missing.
- Not available free: Dream11 credits and ownership percentages.

## 4. Data model (Supabase tables, key fields)
- leagues(id, name, gender, tier)
- teams(id, name, league_id)
- players(id, cricsheet_id, cricinfo_id, name, team_id, role, batting_hand, bowling_type, source_flags)
- manual_overrides(id, entity_type, entity_id, field, value, note, updated_at)
- venues(id, name, city, boundary_notes, is_manual)
- matches(id, league_id, venue_id, team_a, team_b, start_time, status, toss_winner, toss_decision)
- squads(match_id, team_id, player_id)
- predicted_xi(match_id, team_id, player_id, batting_pos_guess, source, confidence)
- match_context(match_id, weather_json, pitch_report_text, pitch_tags_json, fetched_at)
- player_stats(player_id, format, bat_avg, bat_sr, bowl_econ, bowl_sr, snapshot_date)
- player_phase_stats(player_id, phase, balls, runs, wickets, dismissals)
- player_vs_player(batter_id, bowler_id, balls, runs, dismissals, boundaries)
- venue_stats(venue_id, first_inn_avg, second_inn_avg, boundary_pct, spin_econ, pace_econ, chase_win_pct, sample)
- team_form(team_id, as_of, form_index, inputs_json)
- credits(match_id, player_id, credits, source)
- rubric_versions(id, parent_id, config_json, status, reason, created_at)
- recommendations(id, match_id, rubric_version_id, stage[provisional|final], captain_id, vc_id, created_at)
- recommendation_players(recommendation_id, player_id, slot[starter|backup], rank, expected_points, factors_json, reason_text)
- user_teams(match_id, players_json, captain_id, vc_id, confirmed_at)
- actual_points(match_id, player_id, points, entered_by, entered_at, source[dream11_manual|computed_from_scorecard])
- calibration_runs(id, rubric_version_id, metrics_json, created_at)
- pending_adjustments(id, rubric_version_id, parameter, old_value, new_value, evidence_json, status)

## 5. Rubric summary (full detail in RUBRIC.md; locked rules in RULES_LOCKED.md)
Hard filters, expected-points factors with starting weights, capped Team Form Index (about 8 percent), data-defined death-bowler rule, opener-vs-opposing-opening-bowler penalty, captain and vice-captain scoring, post-toss churn guard, risk dial. Every pick stores factors_json so the dashboard can show why.

## 6. Dashboard views (behind a shared PIN)
1. Matches: upcoming list with status chips (data ready, predicted XI, confirmed XI).
2. Match view: both squads, predicted or confirmed XI per team, the agent's 11 with credits and a validity badge, C/VC with reasons, backups (if enabled), pitch/weather/team-form panel, edit mode with live validator, Confirm button.
3. Player drawer: stats, phase splits, venue record, matchups, Aryan's points history, manual-override fields.
4. Post-match: enter actual points per selected player; see predicted vs actual.
5. Rubric and learning: versions, pending adjustments with evidence, accept or reject, accuracy over time.
6. Manual data: tables for missing players or team attributes.

## 7. Integration
- Apify: actors called from the ingestion script via the Apify API token; results stored in Supabase.
- GitHub: repo plus scheduled workflows (cron on match days, manual dispatch, toss-time run).
- Gemini Flash: used by ingestion (pitch report grounding) and the reasoning writer; output constrained to JSON.
- Claude Code: build-time only (skill in .claude/skills/dream11-optimizer). MCP servers for Supabase or Apify may be used during development.
- Vercel: serves the dashboard; no scraping inside serverless functions.

## 8. Milestones
M1 rules config, validator, points function, tests
M2 schema and ingestion (Cricsheet first, then Apify, weather)
M3 derivations and selection engine
M4 Gemini reasoning layer and pitch report
M5 dashboard
M6 post-match entry, calibration, rubric versioning
M7 deploy, Components Map, demo video, viva notes

## 9. Cut list if time runs short (in this order)
Impact-player patterns, ceiling mode, player-vs-player depth, toss-time automation (keep a manual re-run button). Never cut: validator, stored predicted vs actual, working deployed link.

## 10. Open items
Demo league (assumed men's T20I), credits (assumed manual), batting hand and bowling type source (manual table fallback), Cricsheet freshness for 6 and 9 Oct matches (test in M2), Dream11 team rules and points table (three screenshots would settle them).
