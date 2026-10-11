// How the captain and vice-captain are chosen, in plain English. Shown on the match screen and in the Guide.
// This mirrors chooseCaptains() in src/lib/selectTeam.ts and the numbers in src/config/rubric.ts.

export const CAPTAIN_INTRO =
  "Both are chosen before the match, from information available before it starts. Nothing here looks at points scored afterwards.";

export const CAPTAIN_STEPS: { title: string; text: string }[] = [
  {
    title: "Who can be captain",
    text: "Only players who are almost certain to play (90% or more) and who have a big role: a batter or keeper who usually faces 15 or more balls, a front-line bowler who bowls about 3.5 or more overs, or an all-rounder who does both jobs.",
  },
  {
    title: "Who wins the armband",
    text: "Among those, the best mix of points we expect and reliability. We take the points we expect from him, multiply by his chance of playing, and by the share of his recent matches in which he did not have a dud (under 20 points). The captain scores double, so we want a high scorer who rarely flops.",
  },
  {
    title: "The vice-captain",
    text: "The next best player who is very likely to play (85% or more). He gets a small 5% preference if he earns points a different way from the captain (for example a bowler when the captain is a batter), so one bad pitch does not hurt both.",
  },
  {
    title: "If nobody qualifies",
    text: "The player we expect to score the most is made captain, and the screen says that the usual rules could not be met.",
  },
];
