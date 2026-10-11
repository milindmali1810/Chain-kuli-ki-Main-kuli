---
name: dream11-optimizer
description: Rules, rubric and build constraints for Milind's Dream11 Match Day Optimizer (Mesa C4 AI final exam, Hard level). Use whenever building or changing the rules validator, points function, data ingestion, selection engine, Gemini reasoning layer, dashboard, or learning loop for this project.
---

# Dream11 Match Day Optimizer — build skill

Deadline: build EOD 12 Oct 2026. Viva: 15 Oct 2026, 2-8 PM. Grading: Backend logic and build quality 25%, Components Map 10%, working Vercel link 10%, Design 10%, Demo video 5%, Viva 40%. Hard level: Advanced AI needs above 60%.

## Read these before writing any code (in this order)
1. `docs/RULES_LOCKED.md` — team rules and points table, with confidence tags.
2. `docs/RUBRIC.md` — selection, captain/vice-captain, death-bowler and learning-loop logic.
3. `docs/ARCHITECTURE.md` — data flow, tables, dashboard views, milestones, cut list.
4. `docs/HANDOFF.md` — where the last session stopped. Update it at the end of every milestone.

## Hard constraints (never break)
- Runtime AI is Gemini Flash only. Never use the Claude API in the product.
- Deploy on Vercel. Storage in Supabase. Code in GitHub.
- No scraping inside Vercel serverless functions. Ingestion runs as a separate script or scheduled job and writes to Supabase. The app reads Supabase only.
- Selection and validity checks are deterministic TypeScript. Gemini only writes the explanation text from the numbers the engine produces. It never picks players and never checks rules.
- Rules and points tables are DATA in config files, each value with a source and status. Never hardcode them in logic. Team rules default to the strict profile (max 7 per team, WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6).
- Never hardcode player names into any rule (for example death bowlers). Flag them from data.
- Missing data is shown as "unavailable". Never invent values. Seeded or computed history must be labelled as such in the database and in the UI.
- Predicted XI is always labelled "predicted" until the confirmed XI replaces it.
- No win or loss prediction anywhere. Team Form Index is a capped soft factor only.

## How to work with Milind (no coding background; must defend this in a viva)
- Before writing code or running a command, say in plain English what it does and why. Translate any jargon immediately.
- Work in small visible steps. Show the logic, then the step, then the result.
- When something breaks, explain what went wrong, why, and what to watch for next time. Do not just fix it.
- Ask one targeted question when the goal is ambiguous. Do not guess and build.
- Surface decisions and let him decide before proceeding.
- After each milestone give him: a one-sentence description he could say to a non-technical person, the key decision made and why, what he would change next, and a short log (built, learned, broke and fixed).
- Never produce something he cannot explain to someone else.

## Milestones
M1 rules config, validator, points function, tests. M2 schema and ingestion (Cricsheet first, then Apify, weather). M3 derivations and selection engine. M4 Gemini reasoning and pitch report. M5 dashboard. M6 post-match entry, calibration, rubric versioning. M7 deploy, Components Map, demo video, viva notes.
If time runs short, cut in this order: impact-player patterns, ceiling mode, player-vs-player depth, toss-time automation (keep a manual re-run button). Never cut: the validator, stored predicted vs actual points, a working deployed link.

## Handoff rule
At the end of every milestone, update `docs/HANDOFF.md` with: what is built, files and functions, decisions made, open items, and the exact next step. Keep it complete enough for a fresh session to continue without questions.
