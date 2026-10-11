# Demo video script (about 4 minutes)

Record on a laptop at normal width, then show the phone view for 15 seconds at the end. Speak in your own words; the lines below are prompts. The demo is a backtest, so say so in the first minute.

## 0:00 to 0:30 — The problem and the idea
- "Aryan plays Dream11 and spends an hour before every match researching. He also can't tell whether his past picks were good decisions or luck."
- "This agent recommends a valid team, a captain and vice-captain with reasons, then stores predicted and actual points and learns where it is consistently wrong."
- "The rule I built around: **code picks and checks; Gemini only explains.**"

## 0:30 to 1:00 — Sign in and the matches list
- Open the live link, enter the PIN. (Mention it is PIN protected.)
- On the Matches screen: "These matches have already been played. Each prediction uses only data from before the match, so it is a fair test."
- Point at a card: predicted vs actual, the status chip.

## 1:00 to 2:15 — One match in detail (West Indies v India, 6 Oct)
- Open the match. Show **Final** and **Provisional** and explain the difference (confirmed XI vs predicted XI).
- Facts row: "Valid team", "100 of 100 credits", pitch, weather. Say credits are **seeded** because Dream11 publishes none.
- Tap a player (the captain): read the reason out loud and point at the numbers in it. "Every number here was calculated by code. A checker rejects any sentence with a number that isn't in the facts."
- Show the captain card and why the runner-up lost.
- Show the predicted (outlined) and actual (solid) bars. Point at a player who didn't play and a captain who scored low: "This is exactly the kind of miss the system learns from."
- Open "What the model could not use": "It says plainly what it doesn't know."

## 2:00 to 2:25 — Edit and confirm (add about 30 seconds if time allows)
- Tap "Edit and confirm my team". "This is practice because the match has been played; for a live match you can edit until it starts."
- Remove one player: show the plain-English rule errors and the credits changing. Add a replacement and pick a different vice-captain: "valid again".
- Show "How it would have scored": your team vs the agent's, on real points.
- Press "Confirm my team" (optional). Say: "The server checks the rules again before saving."

## 2:15 to 2:50 — Post-match entry
- Scroll to "Enter the real Dream11 points". Change one number, save. "Only the boxes I change are saved as real Dream11 points; the rest stay labelled as computed from the scorecard."
- (Optional) type "abc" to show the error message and that nothing is saved. Remove the test value afterwards if you saved one.

## 2:50 to 3:40 — Learning
- Open Learning: matches compared, average error, over- or under-prediction.
- "It found all-rounders were over-predicted by about 12 points across 42 players." Show the by-role table.
- Show the Versions table: version 1 and version 2, and the like-for-like error column. Read the amber note: the first improvement is measured on the same matches it learned from, so the honest test is new matches.
- Show a pending proposal and click **Accept** (or explain that it only changes if Aryan accepts, capped at 20% per step).

## 3:40 to 4:00 — Close
- Open Guide and the Components map for two seconds: "Every part, from trigger to output."
- Resize to a phone width and show the bottom navigation.
- "Limits I'm upfront about: credits are seeded, the demo is a backtest, no Afghanistan or Indian first-class data."

## Before recording
- Run the app once so Supabase is awake.
- Make sure Learning shows a pending proposal (run `npm run calibrate` first).
- Remove any test entry from the match you will show.
