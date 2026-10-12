# End-to-end audit (13 Oct 2026)

Items are struck through when checked. "FIXED" means a problem was found and corrected in this audit.

1. ~~Code and repo: clean, pushed, same as the deployed build~~ (HEAD pushed; the 4 untracked files are Milind's reference papers, intentionally not committed)
2. ~~Build, types, lint, tests~~ (343 tests pass; production build passes from a fresh clone of GitHub with no keys, twice)
3. ~~Dependencies~~ (npm audit: 0 vulnerabilities). **FIXED:** `sharp` is used by the PNG script but was not declared; now a dev dependency
4. ~~Secrets~~ (scanned all git history and the working tree: no keys committed; `.env.local` is git-ignored; only empty variable names are in `.env.example`)
5. ~~Vercel~~ (all 6 variables present as hidden secrets; latest deployment Ready; every private page redirects to sign-in; the daily-job address answers 401 without the secret). **FIXED:** added standard security headers (no framing, no content sniffing, referrer and permissions policies)
6. ~~Supabase~~ (row-level security on all 25 tables, no public policies, no security warnings; migrations 001 to 004 applied). **FIXED:** 26 foreign keys had no index; added 14 for the ones the app uses (migration 005)
7. ~~Data integrity~~ (one active rubric version; no orphan rows, no duplicate feed ids, every pick has 11 players, every credit exists)
8. ~~App logic~~. **FIXED:** (a) the PIN could be guessed (10,000 combinations, no limit): now 5 wrong tries pause an address for 15 minutes, with a constant-time comparison (tested locally); (b) a match nobody enters points for stayed "upcoming" and at the top of Matches forever: after 36 hours it becomes a past match marked "No result"; (c) no friendly error or not-found page: added both
9. ~~Every screen~~ (no console errors on Matches, Past matches, a match, Learning, Data, Guide, Components map, Add a match). **FIXED:** the "Add a match by hand" ground list contained duplicate names (React key warning)
10. ~~Fixture finder and cron~~ (idempotent, real-feed quirks handled and tested; quota about 12 of 100 calls per run, so do not press "Look for new matches" repeatedly in one day)
11. ~~Docs up to date~~. **FIXED:** README, ARCHITECTURE (was still "no code yet"), VIVA_NOTES (stale "live path not built") and RUBRIC rewritten to match what exists
12. ~~Match history freshness~~: re-downloaded Cricsheet's men's T20I file (22.9 MB, with permission): it ends on 6 Oct, the same as the database, so nothing newer exists yet. The two latest Pakistan v Sri Lanka T20Is will appear when Cricsheet publishes them; re-run `npm run ingest:cricsheet -- --dataset t20s --since 2026-10-01`

## Still open (not malfunctions)
- The PIN is 4 digits (now rate-limited). A longer PIN would be stronger. Milind's call.
- Regenerate the pasted keys after submission (Gemini, Apify, Supabase secret, CricAPI).
- An automatic daily refresh of the history is not built; today it is a manual command.
- Indian first-class data (Ranji, Duleep): no free official source.
- I did not sign in on the live site (entering the PIN on a deployed site is not something I do); every screen was tested on the local copy, which is the same code.
