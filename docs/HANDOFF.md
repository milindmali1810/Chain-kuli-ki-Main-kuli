# HANDOFF.md — Dream11 Match Day Optimizer

Last updated: 11 Oct 2026, night IST (end of Milestone 1). Update this file at the end of every milestone.

## Where we are
Milestone 1 is built and tested (90 passing tests). The scaffold is on GitHub and an empty app is live on Vercel. Data ingestion and the dashboard are NOT started.

- GitHub: https://github.com/milindmali1810/Chain-kuli-ki-Main-kuli (public)
- Vercel project: chain-kuli-ki-main-kuli, live at https://chain-kuli-ki-main-kuli.vercel.app
- The live site now has the PIN screen (APP_PIN set in Vercel production, deployed and tested 11 Oct). Vercel is not connected to GitHub; deploy with `vercel deploy --prod` from the project folder.
- Supabase project: `dream11-optimizer` (ref hpjkyuziarokukhxabru, region ap-south-1, free plan) in org MOH. Empty, no tables yet. To make room on the 2-active-project free limit, the user's other project `dil-chahta-hai` was paused (data kept; restore from the Supabase dashboard).
- .env.local (git-ignored) now holds APP_PIN, GEMINI_API_KEY (tested OK), APIFY_TOKEN (tested OK), NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the sb_publishable_ key, tested OK). SUPABASE_SERVICE_ROLE_KEY is still EMPTY: the user must copy it from Supabase dashboard > Project Settings > API Keys. GEMINI_API_KEY and the Supabase keys are not yet set in Vercel env (add them when the app first needs them). The keys were pasted into chat, so the user should regenerate the Gemini and Apify keys after the build.

## Milestone 1: what is built
- src/config/sourced.ts: `Sourced<T>` label (value, source, status certain|likely|guessing|conflict|unverified).
- src/config/rules.ts: `RULES_PROFILES` (strict default, loose), `FEATURE_FLAGS.backups` (off, unverified). Strict is a subset of loose (tested).
- src/config/points.ts: `POINTS_PROFILES` (standard default, variant). Milestones, strike-rate and economy brackets are data. `excludeSuperOver` is a field of the table.
- src/lib/types.ts: `Player`, `Team`.
- src/lib/validateTeam.ts: `validateTeam(team, rules)` returns `{valid, profile, violations[]}` with every broken rule in plain English. `validateBackupSwap(team, outId, backup, rules, features)` returns the same plus `warnings`; blocked while the backups flag is off.
- src/lib/scorePlayerMatch.ts: `scorePlayerMatch(stats, table)` returns `{total, lines[]}` (the lines are the working). Stats rows carry an optional `superOver` flag and are dropped when the table says so. Base points only: captain and vice-captain multipliers are NOT applied here.
- src/lib/pin.ts, src/proxy.ts, src/app/login/page.tsx, src/app/api/login/route.ts: PIN gate. Server compares the typed PIN with APP_PIN; cookie `d11_auth` holds a SHA-256 fingerprint, never the PIN. If APP_PIN is unset nobody gets in. This Next.js version calls middleware "proxy".
- tests/: helpers, config, validateTeam, validateBackupSwap, scorePlayerMatch, pin. Run with `npm test`.
- .env.example has names only. .env.local is git-ignored (it also holds a VERCEL_OIDC_TOKEN written by `vercel link`).

## Who and what
- Builder: Milind (Mesa C4, no coding background; must explain everything in a viva on 15 Oct 2026, 2-8 PM).
- Exam: AI Final Evaluation, Hard level. Build deadline EOD 12 Oct 2026. Advanced AI needs above 60% on Hard.
- Grading: Backend logic and build quality 25%, Components Map 10%, working Vercel link 10%, Design 10%, Demo video 5%, Viva 40%.
- Brief: match day optimizer for "Aryan" — valid Dream11 team, captain and vice-captain with specific reasons, post-match actual points stored in Supabase beside predicted points, and a loop that spots consistent errors and suggests weight changes.
- Constraints from the booklet: all AI tasks use Gemini Flash (no Claude API); deploy on Vercel; submit public URL, GitHub repo link and Components Map.

## Decisions made
- Stack: Next.js (TypeScript) + Supabase + Vercel, as in Milind's earlier builds. Access via shared PIN.
- Scope: men's T20I only for the demo; league is a config field.
- Selection and validity are deterministic code. Gemini only writes reasoning text.
- Rules and points tables are config data. Team rules default to the strict profile (7 per team, WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6) because the real rule is in conflict across sources (7 vs 10; role limits 1-8). Points default to the "standard" profile (four +1, six +2). See RULES_LOCKED.md.
- No win or loss prediction. Team Form Index is a capped soft factor (about 8 percent) that the learning loop can test and switch off.
- Death-bowler rule is data-defined with a guaranteed slot unless clearly outscored; no names hardcoded.
- Predicted XI is labelled "predicted" until confirmed; Dream11 credits are entered manually.
- Data: Cricsheet primary (free ball-by-ball), Apify actors supplementary, weather API free, Gemini grounding for pitch report text; ingestion runs outside Vercel and writes to Supabase.
- Learning loop proposes versioned changes only; Aryan approves.
- Backups feature flag off by default (rule not verified).

## Decisions made in Milestone 1
- Gemini model ID: `gemini-3.8-flash` is the current stable Flash (checked on ai.google.dev, 11 Oct 2026). Keep the ID in a setting, not scattered in code. gemini-2.0-flash is shut down.
- Supabase client: `@supabase/supabase-js`, `createClient(url, key)`. The docs now say "publishable key"; our env name NEXT_PUBLIC_SUPABASE_ANON_KEY is kept. The service role key is server-only, never NEXT_PUBLIC_.
- Vercel project names must be lowercase, so the project is chain-kuli-ki-main-kuli while the GitHub repo is Chain-kuli-ki-Main-kuli.
- @types/node moved from 20 to 24 because Vitest 5 needs 22 or higher.
- Private files kept out of the public repo: the exam PDF and the three personal notes (cricket_strategy_notes.md, dream11_t20_rulebook.md, strategy 2.md).
- Variant points profile: "four +4, six +6" is stored as a bonus on top of run points (guessing). It lists no 50-run bonus, so standard's +8 is copied and tagged guessing.

## Files in this folder
- .claude/skills/dream11-optimizer/SKILL.md — build rules and working style for Claude Code
- docs/ARCHITECTURE.md — flow, data model, dashboard views, milestones, cut list
- docs/RUBRIC.md — full selection rubric with parameter IDs and defaults
- docs/RULES_LOCKED.md — locked team rules and points table with confidence tags
- docs/HANDOFF.md — this file

## Open items
0. Milind to paste SUPABASE_SERVICE_ROLE_KEY into .env.local (server-only). PIN 3030 is short and guessable; consider a longer one before the viva.
1. Three Dream11 screenshots (team-creation screen, in-app points page, backup screen) would settle the unverified rules.
2. Confirm the demo league and that credits are entered manually.
3. Cricsheet freshness (checked 11 Oct 2026 using recently_added_7_male_json.zip): the 6 Oct 2026 West Indies v India T20I (Lucknow, file 1529230) IS present. The 9 Oct match was not in that 7-day file; confirm against the full t20s_json.zip (22.9 MB, 5,775 matches) in M2.3. The series is a West Indies tour of India: ODIs on 30 Sep and 3 Oct, then T20Is from 6 Oct. Seed from older completed T20Is, labelled seeded, only if needed.
4. Batting hand and bowling type source (manual table fallback).
5. Components Map: build the swimlane grid (actors as rows; Trigger, Input, Context, Processing, AI, Output as columns) in M7.

## Milestone 2 progress
- 2.1 DONE: supabase/migrations/20261011_001_initial_schema.sql applied to project hpjkyuziarokukhxabru. 24 tables (the 22 in ARCHITECTURE.md section 4 plus player_match_lines and ingestion_runs), RLS on, no policies: only the secret key can read or write. Verified: secret key can write, public key reads nothing and cannot write. data_origin column (ingested|seeded|computed|manual) on computed/seeded tables. player_phase_stats has an added `discipline` column (bat|bowl).
- 2.2 DONE: Cricsheet freshness checked (see open item 3).
- 2.3 NEXT: ingestion script in scripts/ (Cricsheet first, then Apify, weather). Needs Milind's OK to download the full t20s_json.zip (22.9 MB). Runs outside Vercel, writes with the secret key. Install @supabase/supabase-js then.
- Open question for Milind: which upcoming match is the demo match, and where do fixtures/squads come from (Apify Cricbuzz actor)?

## Next step
Continue Milestone 2 at 2.3. Ingestion runs outside Vercel. Wait for Milind to say go.

(Milestone 1 prompt, now done, kept for reference:)
"Set up a Next.js (TypeScript) project with Vitest. Read docs/RULES_LOCKED.md and docs/RUBRIC.md first. Create src/config/rules.ts with the team rules as plain data (profiles strict and loose, each value with source and status), src/config/points.ts with the T20 points table (profiles standard and variant), validateTeam(team, rules) returning every violated rule in plain English, validateBackupSwap, and scorePlayerMatch(stats, pointsTable) as a pure function. Write tests: a valid team passes, one test per rule violation (credits, size, team cap, each role limit, missing or same captain and vice-captain), and a worked scorecard example I can check by hand. Before coding, explain in plain English what each file does and why the rules are data and not code. Then run the tests and show me the results."

## Session log
Date | What was built | Key learning | What broke | Next goal
11 Oct 2026 | Design, rubric, locked rules, skill file | Rules and points sources conflict; strict defaults keep validity safe | Nothing built yet | M1 validator and points function
11 Oct 2026 | M1: scaffold, GitHub, Vercel, PIN gate, rules and points config, validator, scorer, 90 tests | Config as labelled data; test data can be wrong too | (1) copying node_modules was slow and incomplete, so reinstalled; (2) vercel rejected the folder name, fixed by linking a lowercase name; (3) Vitest vs @types/node 20 conflict, moved to 24; (4) /login failed to pre-build until the searchParams part was wrapped in Suspense; (5) two of my own test lineups had 6 batters, not 7 | M2 schema and ingestion
