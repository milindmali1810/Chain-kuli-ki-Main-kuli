# HANDOFF.md — Dream11 Match Day Optimizer

Last updated: 11 Oct 2026, evening IST. Update this file at the end of every milestone.

## Where we are
Design phase complete. No application code exists yet. Next step is Milestone 1 in Claude Code.

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

## Files in this folder
- .claude/skills/dream11-optimizer/SKILL.md — build rules and working style for Claude Code
- docs/ARCHITECTURE.md — flow, data model, dashboard views, milestones, cut list
- docs/RUBRIC.md — full selection rubric with parameter IDs and defaults
- docs/RULES_LOCKED.md — locked team rules and points table with confidence tags
- docs/HANDOFF.md — this file

## Open items
1. Three Dream11 screenshots (team-creation screen, in-app points page, backup screen) would settle the unverified rules.
2. Confirm the demo league and that credits are entered manually.
3. Test Cricsheet freshness for the India vs West Indies T20Is of 6 and 9 Oct 2026 in M2; if missing, seed from older completed T20Is and label as seeded.
4. Batting hand and bowling type source (manual table fallback).
5. Components Map: build the swimlane grid (actors as rows; Trigger, Input, Context, Processing, AI, Output as columns) in M7.

## Next step
Milestone 1: rules config, validator, points function and tests. Prompt for Claude Code:
"Set up a Next.js (TypeScript) project with Vitest. Read docs/RULES_LOCKED.md and docs/RUBRIC.md first. Create src/config/rules.ts with the team rules as plain data (profiles strict and loose, each value with source and status), src/config/points.ts with the T20 points table (profiles standard and variant), validateTeam(team, rules) returning every violated rule in plain English, validateBackupSwap, and scorePlayerMatch(stats, pointsTable) as a pure function. Write tests: a valid team passes, one test per rule violation (credits, size, team cap, each role limit, missing or same captain and vice-captain), and a worked scorecard example I can check by hand. Before coding, explain in plain English what each file does and why the rules are data and not code. Then run the tests and show me the results."

## Session log
Date | What was built | Key learning | What broke | Next goal
11 Oct 2026 | Design, rubric, locked rules, skill file | Rules and points sources conflict; strict defaults keep validity safe | Nothing built yet | M1 validator and points function
