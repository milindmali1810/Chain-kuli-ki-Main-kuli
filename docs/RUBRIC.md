# RUBRIC.md — Dream11 T20 selection rubric (v1.0, starting hypotheses)

All numbers below are STARTING VALUES [Guessing] unless marked. Each has a parameter ID so it can be changed in config and versioned. Nothing here predicts match results; it estimates each player's expected fantasy points under the match conditions.

## 0. Principles
1. Code selects and validates. Gemini Flash only writes the explanation from the numbers.
2. Rules and points tables are data (rules config, points config), both marked "unverified" until checked against Dream11 screenshots.
3. Missing data is shown as "unavailable", never filled in. Thin data is shrunk toward a prior.
4. Every pick stores its factor breakdown so the dashboard can explain it.

## 1. Data tiers (decides how much trust each factor gets)
- Tier 1: ball-by-ball history plus profiles exist for this league (full rubric applies).
- Tier 2: player-level stats only (matchup and phase factors set to neutral, flagged).
- Tier 3: roles and squad only (selection by role priors, low-confidence label shown).
Every recommendation displays its tier.

## 2. Stage 1 — Hard filters (fail = removed from candidate pool)
- H1: In squad and not flagged unavailable.
- H2: P(plays) >= P_PLAY_MIN (0.75). Below 0.75 allowed only as "provisional" until the XI is confirmed.
- H3: Bowlers need a likely quota of at least Q_MIN (3 overs).
- H4: Minimum sample for any stat to be used: SAMPLE_BAT (30 balls), SAMPLE_BOWL (12 balls). Below it, the stat is replaced by the role prior.
- H5: Final team must pass the rules validator (11 players, credits, per-team and per-role limits).
- H6: If a player's credit is unknown, he is excluded from the optimiser (shown in a "needs credits" list).

## 3. Stage 2 — Expected points per player
Expected points = Opportunity x Efficiency x Conversion, computed with the points table, then adjusted by Stages 3-5 and weighted as in section 8.

### 3a. Batters (BAT, WK, batting AR)
- Opportunity: expected balls faced from batting-position band. Priors [Guessing]: pos 1-2 = 28, pos 3 = 26, pos 4 = 20, pos 5 = 15, pos 6 = 11, pos 7 = 7, pos 8+ = 3. Blend with the player's own median balls in last N_RECENT (8) innings using n/(n+K_BAT), K_BAT = 60 balls.
- Efficiency: strike rate and average, career and last N_RECENT, blended by recency weight RECENT_W (0.4).
- Conversion: probability of reaching 30 and 50 (bonus thresholds from the points table), and duck risk.
- Strike-rate bonus and penalty brackets come from the points table, not hardcoded.

### 3b. Bowlers (BOWL, bowling AR)
- Opportunity: expected overs from role (frontline = 4, part-timer = 2) and the player's median overs in last N_RECENT matches.
- Efficiency: economy and bowling strike rate relative to league averages, by phase.
- Conversion: expected wickets, bowled/LBW share, probability of 3+ wickets, economy-bonus eligibility (2+ overs).

### 3c. Fielding
- Expected catches and stumpings from role, small weight; history used only above sample minimum.

## 4. Stage 3 — Context adjustments
### Pitch tags (derived from venue history, relative to league average)
- SPIN_FRIENDLY if the venue spin-wicket share index >= SPIN_IDX_HI (1.10); PACE_FRIENDLY if the pace index >= 1.10; opposite below 0.90.
- HIGH_SCORING if venue first-innings average >= league average +8% (BAT_ENV_HI); LOW_SCORING if <= -8%.
- Chase bias: second-innings win % minus 50 above CHASE_BIAS (5 points).
- Adjustments (ADJ_PITCH = 0.10): spinners x(1+0.10) on SPIN_FRIENDLY, x(1-0.10) on PACE_FRIENDLY; reverse for pacers; batters in HIGH_SCORING x1.05; wicket-based points x1.05 in LOW_SCORING.
- If venue sample is under VENUE_MIN (8 matches), pitch tags are low-confidence and halved.
- Pitch report text from Gemini: used only to confirm or soften tags (max +-3%), never to override data.

### Weather
- Dew flag: evening start and humidity >= 70% (DEW_HUM). Effects (ADJ_DEW = 0.05): second-innings batters x1.03, spinners and defending-side bowlers x0.95.
- Rain risk >= 40% (RAIN_HI): reduce expected overs for bowlers' ceiling and flag; nothing else changes.
- Overcast and humid with PACE_FRIENDLY: pace opening bowlers x1.03.

### Toss (post-toss only)
- Batting first vs chasing changes batting position priors and bowling phase, and activates the dew effect for the chasing side. No win prediction is made or shown.

### Team Form Index (soft, capped)
- Index from the last 8 completed T20 matches (decay 0.85 per match), opposition-strength adjusted, with net run rate. League table position used only after 5 matches.
- Effect on each player's expected points: at most +-TEAMFORM_CAP (8%). Disabled in backtests when the loop shows no benefit.
- Never forces the 4-7 team split; the optimiser decides.

## 5. Stage 4 — Matchups
- Type-level first: batter hand vs bowler type (left-hand vs off-spin, right-hand vs left-arm spin and leg-spin, pace vs spin, short-ball), computed from ball-by-ball history; adjust expected points within MATCHUP_RANGE (0.85-1.15).
- Head-to-head second: only if balls >= H2H_MIN (30). Adjust within H2H_RANGE (+-10%), shrinking toward the type-level number by n/(n+30).
- Weight each matchup by overlap: how many overs this bowler is expected to bowl to this batter, given order and phase.
- Opener vs opposing opening bowler penalty: if both are selected, apply OPEN_PEN (0.05) to the lower-ranked, unless pace-friendly conditions favour the bowler.

## 6. Stage 5 — Specialist death bowler (distinct rule)
- Profile D (pure death): >= DEATH_SHARE (50%) of overs in last 15 matches fall in overs 17-20.
- Profile N+D (new ball plus death): >= 1 powerplay over and >= 1 over in 17-20 in at least 60% of last 15 matches.
- Quality measures (versus league average at death): economy edge, wickets per over, bowling strike rate. DEATH_SCORE = 0.4 economy edge + 0.4 wickets + 0.2 strike rate.
- Sample: >= DEATH_MIN_OVERS (30 death overs in 24 months); in thinner leagues >= 15 overs with heavier shrinkage and a low-confidence flag.
- Slot rule: the best death specialist across both teams gets +10% (DEATH_BONUS) and a guaranteed slot if his adjusted expected points rank within the top 14 of 22 (DEATH_RANK). If not, he is dropped and the reason is logged.
- Opener trade-off: decided by adjusted expected points with the death bonus; a clearly stronger opener still wins.
- Fallback if no specialist exists: best pace bowler with a locked 4-over quota; log "fallback used".
- Names are never hardcoded.

## 7. Stage 6 — Team assembly
- Objective: maximise the sum of adjusted expected points plus captain and vice-captain multipliers, subject to the validator and credit cap.
- Role balance targets (soft, within legal limits): 1 WK, 3-4 BAT, 1-2 AR, 3-4 BOWL; deviations need a reason.
- Team split: whatever the optimiser finds within the legal per-team limit; flag if one team has more than 6 players, for explanation.
- Tie-break: expected points per credit, then higher floor.
- Risk dial RISK_MODE: "expected" (default) or "ceiling" (adds CEIL_W 0.15 weight on the 80th-percentile outcome).

## 8. Default weights (hypotheses)
| ID | Factor | Default | Safe range |
|---|---|---|---|
| W_ROLE | Role and opportunity | 30 | 20-40 |
| W_SKILL | Skill baseline | 25 | 15-35 |
| W_VENUE | Venue and pitch | 15 | 5-25 |
| W_MATCH | Matchup | 15 | 5-25 |
| W_FORM | Recent form | 10 | 5-20 |
| W_WEATHER | Weather | 5 | 0-10 |
| TEAMFORM_CAP | Team form | cap 8% | 0-12% |

## 9. Stage 7 — Captain and vice-captain
### Eligibility
- Captain: stable top-4 batter, or a frontline bowler with a locked 4-over quota, or an all-rounder who bats in the top 6 and bowls >= 3 overs. P(plays) >= 0.90, role stable for the last 3 matches.
- Vice-captain: any selected player with P(plays) >= 0.85; matchup-dependent players and finishers allowed.

### Scores
- Captain score = adjusted expected points x floor factor. Floor factor = P(plays) x role stability x (1 - dismissal or wicketless risk versus the likely matchup).
- Vice-captain score = adjusted expected points + DIVERSIFY (0.05) if his main route to points differs from the captain's (bat vs bowl, or a different game script).
- If the same player tops both lists, he is captain, and the vice-captain is the best player from the opposite discipline.
- Close calls (within 3%): higher floor, then higher credit efficiency, then the bowler for captain on LOW_SCORING pitches or the batter on HIGH_SCORING.

## 10. Stage 8 — Backups (feature flag, off by default until verified)
- Rank by P(plays) x adjusted expected points among swaps that keep the team valid.
- Include a wicket-keeper backup if only one WK is selected, and at least one backup of each role the starting team depends on.

## 11. Post-toss re-run
- Remove non-playing players; promote legal backups; replace guessed batting orders and bowling phases with confirmed ones; apply toss and dew effects; re-read weather.
- Churn guard CHURN_MIN (5%): change a pick only if adjusted expected points improve by more than the threshold.

## 12. Explanation requirements (dashboard)
- Each pick: at least 3 specific numbers (expected balls faced, average against this bowler type, venue record, pitch tag) and the factor that decided it.
- Captain and vice-captain: why the next-best candidate lost.
- Missing or low-confidence factors listed explicitly, with the data tier.

## 13. How Aryan tweaks it
- Editable: every parameter in sections 2-11, via the rubric screen, each within its safe range.
- Every change creates a new version with date, old value, new value and reason; earlier versions stay available for rollback.
- The learning loop proposes, never applies: it measures MAE of expected vs actual points by role, bias by pitch tag and venue type, and captain regret (points lost vs the best available captain). It only proposes after MIN_ROWS (20) predicted-vs-actual rows, changes one parameter group at a time, and by at most +-20% of the current value per cycle.
- Manual overrides (players, roles, hands, bowling types) live in a separate table and take priority over scraped values.
