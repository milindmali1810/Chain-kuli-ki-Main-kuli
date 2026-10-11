# RULES_LOCKED.md — values locked 11 Oct 2026 (all editable in config)

## A. Team rules (affect validity, so the SAFE choice is used)
| Parameter | Locked value | Confidence | Why |
|---|---|---|---|
| players | 11 | Certain | all sources agree |
| credit_cap | 100 | Certain | all sources agree |
| max_per_team | 7 | Conflict (7 vs 10) | A team that obeys 7 also obeys 10. Switchable profile "loose" = 10. |
| WK / BAT / AR / BOWL limits | 1-4 / 3-6 / 1-4 / 3-6 | Conflict (this vs 1-8) | Strict set is valid under both. Switchable profile "loose" = 1-8 each. |
| captain multiplier | 2x | Certain | Dream11 page |
| vice-captain multiplier | 1.5x | Certain | Dream11 page |
| captain != vice-captain | required | Certain | basic rule |
| backups | optional suggestion only, up to 4, flag OFF by default | Unverified | not found in sources; never affects validity |
| super over events | excluded | Certain | Dream11 page |

Profile switch: rules_profile = "strict" (default) | "loose". Validator output states which profile it checked against.

Source note: the Gemini-generated rulebook (dream11_t20_rulebook.md) says 10 per team and 1-8 per role. A Dream11-domain page (fantasycricket.dream11.com) says the same, while another Dream11-domain page and several guides say 7. The conflict is unresolved, hence the strict default.

## B. T20 points table, "standard" profile (affects ranking only)
Batting:
- run +1 [Likely]
- four bonus +1 [Likely] (a four = 5)
- six bonus +2 [Likely] (a six = 8)
- 30-run bonus +4 [Likely, from the Gemini file; milestone bonuses do not stack]
- half-century +8 [Likely]
- century +16 [Likely]
- duck -2 for BAT, WK, AR [Certain]
- strike-rate bonus, min 10 balls, not for bowlers: >170 +6, 150.01-170 +4, 130-150 +2 [Likely]
- strike-rate penalty, min 10 balls, not for bowlers: 60-70 -2, 50-59.99 -4, <50 -6 [Guessing: exact brackets only in the Gemini file]

Bowling:
- wicket (not run out) +25 [Likely]
- bowled or LBW bonus +8 [Likely]
- 3-wicket +4, 4-wicket +8, 5-wicket +16, no stacking [Likely]
- maiden over +12 [Likely]
- economy, min 2 overs: <5 +6, 5-5.99 +4, 6-7 +2, 10-11 -2, 11.01-12 -4, >12 -6 [Likely]

Fielding:
- catch +8, 3-catch bonus +4, stumping +12, direct-hit run out +12, shared run out +6 each [Likely]

Other:
- playing-XI points +4 [Guessing: an older source says +2]

Alternate profile "variant" (four +4, six +6, 25-run +4, 75-run +12, century +16) is stored but NOT default, because it is unclear which contest type it applies to.

## C. What stays unverified (shown in the dashboard as a banner)
- per-team cap and role limits (strict profile used)
- strike-rate penalty brackets, playing-XI points, backups
Resolved by three screenshots: team-creation screen, points page, backup screen.

## D. Why this is safe
- The validator uses the strict profile, so every output is valid under either real rule set.
- Points errors only shift expected-points rankings. Actual points entered by Aryan after each match measure the error, and the learning loop corrects it by role.
- Every config value carries source and status, and every recommendation records which rules and points profile version it used.
