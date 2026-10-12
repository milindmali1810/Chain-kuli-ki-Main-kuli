# Demo video script (about 5 minutes)

Screen-record the live site on a laptop at normal width, then show the phone view for 15 seconds at the end. Speak in your own words; the lines below are prompts, not a speech. Live link: https://chain-kuli-ki-main-kuli.vercel.app

## Before you press record (10 minutes)
1. Open the site and sign in with the PIN once, so the database is awake and the first screen is quick.
2. Press **Look for new matches** (bottom of the home page, under "Match missing from the list?") once so the list is fresh. It uses about 12 of the feed's 100 free calls a day, so do it once, not repeatedly.
3. Open the **next match** and press **Update the team now** (under "More about this team") about a minute before recording. Gemini then writes the reasons (about 35 seconds); refresh until the reasons read as sentences, not "still being written".
4. Use the light theme and a clean browser window. Zoom to about 110% so the text reads on video.
5. Decide which played match you will use for the "enter points" demo (West Indies v India, 6 Oct is the one with Gemini reasons). Saving points there makes the agent update itself, so you will undo it at the end (see "Cleanup").

## 0:00 to 0:30 — The problem and the one rule
- "Aryan plays Dream11 and spends an hour before every match researching. He also cannot tell whether his past picks were good decisions or luck."
- "This agent finds the next match by itself, builds a valid team with a captain and vice-captain and the reasons, lets Aryan keep or change it, then learns from the points he enters afterwards."
- "The rule I built around: **code picks and checks; Gemini only explains.** The AI never chooses a player and never checks a rule."

## 0:30 to 1:15 — The agent finds the match (home page)
- Sign in. Point at the **Next match** card: "Nobody typed this in. The agent found it from an official fixture feed. I did not scrape Cricbuzz or Cricinfo, because their rules forbid bots."
- Point at **Coming up**: "It covers men's internationals, the IPL and the Syed Mushtaq Ali Trophy, the leagues we have history for. Matches more than three days away show 'Not built yet'; the agent builds each team about three days before the match, and a daily job does it automatically."
- Press **Look for new matches** only if you did not already; say "this is also what the morning job does".

## 1:15 to 2:30 — One match: the agent's team
- Open the next match (**Review the team**). Say: "One page, three steps: review the team, keep or change it, enter the points after."
- Tap the captain: read the reason aloud and point at the numbers. "Every number in this sentence was calculated by code. A checker throws away any sentence with a number that is not in the facts."
- Show the captain card: "These are real cricket reasons Aryan can repeat to his league, and why the runner-up lost."
- Open **More about this team**: rules check ("Valid team"), credits (say plainly: **the credits are the agent's own estimates because Dream11 publishes no free credit data**), pitch, and "What the model could not use".
- Say: "The playing XI is a prediction from each side's last five matches. The real XI is announced at the toss and no free source publishes it, so Aryan can change a player himself."

## 2:30 to 3:00 — Keep it or change it
- Step 2 on the same page: show "Valid team · 11/11 players · 100/100 credits" and **Confirm my team**.
- Open **Change players, captain or vice-captain**: remove a player so a rule breaks and read the plain-English message; add one back and change the vice-captain. "Valid again. The server checks the rules a second time before it saves."
- "Aryan can edit until the match starts. Then he enters the team in Dream11 himself."

## 3:00 to 3:40 — After the match: his points, and the agent learns
- Open the played match (West Indies v India). Open **After the match: enter the points your team scored**. Change one player's points and type the team total Dream11 shows, then save.
- Read the banner out: the agent compared its prediction with what happened and updated its rubric for the next match (a new version number). "Only the boxes I changed are saved as real Dream11 points."
- Open **Learning** and show the new version under Details, and the **Undo this change** button. Press it: "Every change is a numbered version and can be undone."

## 3:40 to 4:30 — Does it actually work? (be honest, this is the strong part)
- On **Learning**, read the verdict card: "On the matches stored here, the agent's picks score about 0.8 points per player more than a random legal team. That small gap is inside the margin of error, so I do not claim it from this alone."
- Then say the bigger test: "I replayed 361 past international matches, using only data from before each one. A random legal team scores 1.7 points per player below the average player, and the agent about 0.8 above it. So it beats a random legal team by about 2.5 points per player, roughly 25 to 30 points per team. That is well outside the margin of error."
- Say the limits: "Most of that skill is plain recent form; venue and team form add very little. My first learning-loop version made it worse, because it learned from only 16 matches, and the bigger test caught it. Version 4 resets that."
- Open **Past matches** on the home page: "Predicted, then actual, for 30 matches. Team scores swing a lot, so a single match proves little."

## 4:30 to 5:00 — Close
- Open **Guide** and the **Components map** for two seconds: "Every part, from trigger to output."
- Resize to phone width and show the bottom navigation.
- Limits, said clearly: "The credits are estimates, the XI is a prediction, the points table is likely right but not confirmed against Dream11, and there is **no Indian first-class data (Ranji, Duleep)**, because no free official source exists. Afghanistan matches are withheld by the data source."
- End: "It is deployed on Vercel, the data is in Supabase, the code is on GitHub, and Gemini Flash is the only AI at runtime."

## Cleanup after recording
- Press **Undo this change** on Learning if the demo created a version you do not want live, and tell Claude to delete the test points entry for the match you used (it removes the "Dream11 manual" rows and the test team).
- Make sure the next match is not left marked as confirmed unless you really confirmed it.

## If someone asks
- "Why a backtest?" There is no live match you can score before the deadline, so past matches are the fair test: each prediction used only data from before the match.
- "Is it just luck?" Show the 361-match result: +0.8 against -1.7 for a random legal team, with the margin of error.
- "Are the credits real?" No. They are labelled as estimates everywhere. Typing real ones is optional on the "Change the playing XI" page.
- "Why not scrape Cricbuzz?" Their robots.txt forbids bots; I used an official fixture API instead.
