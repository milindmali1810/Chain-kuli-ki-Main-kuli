import { describe, it, expect } from "vitest";
import { extractText, generateJson } from "@/lib/gemini";
import {
  allowedNumbers, assembleExplanation, buildCaptainCase, buildPrompt, checkText, templateCaptain, templatePick, templatePitch,
  templateSummary, templateVice, ungroundedNumbers, type Facts, type PickFacts, OUTPUT_SCHEMA,
} from "@/lib/reasoning";

const pick = (over: Partial<PickFacts>): PickFacts => ({
  playerId: 1, name: "Player One", role: "BAT", team: "Team A", opponent: "Team B", credits: 9.5, expectedPoints: 44.3, rank: 1,
  isCaptain: false, isViceCaptain: false, basePoints: 41.2, recentMean: 47.5, longMean: 38.9, rolePrior: 31.4,
  matchesUsed: 30, lastPoints: [76, 12, 33, 8, 61], venueEffectPct: 2.5, teamFormEffectPct: -1, chanceOfPlayingPct: 80,
  blankMatchesPct: 27, avgBallsFaced: 21.3, avgOvers: null, deathBonusPct: 0, death: null, ...over,
});

const picks: PickFacts[] = [
  pick({ playerId: 1, name: "Player One", isCaptain: true }),
  pick({ playerId: 2, name: "Player Two", role: "BOWL", isViceCaptain: true, expectedPoints: 39.4, lastPoints: [62, 27, 5, 44, 30], avgBallsFaced: null, avgOvers: 3.8, chanceOfPlayingPct: 100 }),
];

const facts: Facts = {
  context: {
    stage: "final", matchLabel: "Team A v Team B", date: { day: 6, month: 10, year: 2026 }, venue: "Test Ground",
    pitch: { tag: "HIGH_SCORING", indexPct: 11.1, matches: 22, lowConfidence: false },
    weather: { tempC: 26.2, humidityPct: 77, dewPointC: 21.8, rainMm: 0, cloudPct: 4.3, windKmh: 6.7 },
    teamFormEffectPct: { "Team A": 6.8, "Team B": -1 }, totalCredits: 99.5, creditCap: 100, creditsAreSeeded: true,
    composition: { byRole: { BAT: 1, BOWL: 1 }, byTeam: { "Team A": 1, "Team B": 1 } }, deathWindowMonths: 24,
    deathLog: [], unavailableFactors: ["Batter vs bowler-type matchups"],
    captaincy: buildCaptainCase(picks, ["Player One", "Player Two"]),
  },
  picks,
};
const allowed = allowedNumbers(facts);

describe("number guard", () => {
  it("knows every number in the facts, including those inside text", () => {
    // 55.4 and 39.4 are the points we expect from the captain and the runner-up if they play.
    for (const n of [44.3, 76, 6, 10, 2026, 26.2, 77, 22, 55.4, 39.4, 100]) expect(allowed.has(n)).toBe(true);
  });

  it("accepts text that only uses fact numbers", () => {
    expect(ungroundedNumbers("Expected 44.3 points after scoring 76 and 61 recently.", allowed)).toEqual([]);
  });

  it("flags a number that is not in the facts", () => {
    expect(ungroundedNumbers("He has hit 3 centuries and averages 47.9.", allowed)).toEqual(["3", "47.9"]);
  });

  it("tolerates harmless rounding: 44.30 or 44 for 44.3", () => {
    expect(ungroundedNumbers("About 44 points, or 44.30 exactly.", allowed)).toEqual([]);
  });

  it("a pick's sentence may only use THAT player's numbers plus the match context", () => {
    // 39.4 and 3.8 belong to Player Two. Valid for him, but not for Player One.
    const forOne = allowedNumbers(facts, 1);
    const forTwo = allowedNumbers(facts, 2);
    expect(ungroundedNumbers("Expected 44.3 points, last scores 76 and 61, in 77% humidity.", forOne)).toEqual([]);
    expect(ungroundedNumbers("He is expected to score 39.4 points.", forOne)).toEqual(["39.4"]);
    expect(ungroundedNumbers("He is expected to score 39.4 points.", forTwo)).toEqual([]);
  });

  it("a whole-team sentence (summary, pitch) may use anyone's numbers", () => {
    expect(ungroundedNumbers("Between 39.4 and 44.3 expected points.", allowed)).toEqual([]);
  });

  it("rejects internal jargon a fan could not repeat, even when every number is real", () => {
    for (const t of [
      "Player One takes the captaincy with a leading captaincy score of 44.3.",
      "Player One has an expected points projection of 44.3.",
      "He won the captain race with 76.",
      "Player One's recentMean is 44.3.",
      "Weather is null at 77.",
    ]) expect(checkText(t, allowed), t).toEqual({ ok: false, why: "internal jargon a fan could not repeat" });
  });

  it("allows 'last 24 months' because the 24-month window is itself a fact", () => {
    expect(checkText("He has bowled well at the death over the last 24 months, scoring 76 last time.", allowed).ok).toBe(true);
  });

  it("accepts the same facts written the way a person would say them", () => {
    expect(checkText("We expect about 44.3 points from Player One, and he scored 76 last time.", allowed).ok).toBe(true);
  });

  it("rejects win and loss predictions even when the numbers are fine", () => {
    expect(checkText("Team A will win because they scored 76.", allowed)).toEqual({ ok: false, why: "win/loss prediction" });
    expect(checkText("They are favourites with 44.3 expected points.", allowed).ok).toBe(false);
  });

  it("rejects empty and non-text answers", () => {
    expect(checkText("", allowed).ok).toBe(false);
    expect(checkText(42, allowed).ok).toBe(false);
  });
});

describe("templates (the fallback) are themselves grounded", () => {
  it("every template only uses numbers from the facts, so the guard and the fallback agree", () => {
    const texts = [
      ...facts.picks.map(templatePick),
      templateCaptain(facts, facts.picks[0]).reason,
      templateCaptain(facts, facts.picks[0]).whyNotRunnerUp,
      templateVice(facts, facts.picks[1]),
      templatePitch(facts.context),
      templateSummary(facts.context),
    ];
    for (const t of texts) expect(ungroundedNumbers(t, allowed), t).toEqual([]);
    // ...and none of them uses jargon a fan could not repeat.
    for (const t of texts) expect(checkText(t, allowed).ok, t).toBe(true);
  });

  it("the captain template speaks in cricket terms and names the runner-up and why he is behind", () => {
    const c = templateCaptain(facts, facts.picks[0]);
    expect(c.reason).toContain("he bats long, averaging 21.3 balls an innings");
    expect(c.reason).toContain("55.4");
    expect(c.reason).toContain("27%");
    expect(c.whyNotRunnerUp).toContain("Player Two");
    expect(c.whyNotRunnerUp).toContain("we expect fewer points from him (39.4 against 55.4)");
  });

  it("missing weather is stated, not invented", () => {
    expect(templatePitch({ ...facts.context, weather: null })).toContain("Weather unavailable");
  });
});

const goodGemini = {
  picks: [
    { playerId: 1, reason: "Player One is expected to score 44.3 points; his last scores were 76 and 61, and the 2.5% venue boost helps." },
    { playerId: 2, reason: "Player Two bowls 3.8 overs on average and is expected to score 39.4 points." },
  ],
  captain: { playerId: 1, reason: "Player One bats long, averaging 21.3 balls an innings, and we expect about 55.4 points from him.", whyNotRunnerUp: "Player Two is behind: we expect fewer points from him, 39.4 against 55.4." },
  viceCaptain: { playerId: 2, reason: "Player Two earns points with the ball, so the two do not depend on the same thing; we expect about 39.4 points and he plays with certainty at 100%." },
  pitchReport: "The pitch is high scoring, 11.1% above average over 22 matches, with 77% humidity.",
  summary: "The team costs 99.5 of 100 credits.",
};

describe("assembleExplanation", () => {
  it("accepts honest Gemini text for everything", () => {
    const e = assembleExplanation(facts, goodGemini);
    expect(e.report).toEqual({ acceptedFromGemini: 7, replacedByTemplate: 0, rejections: [] });
    expect(e.picks.get(1)!.source).toBe("gemini");
    expect(e.captain.source).toBe("gemini");
  });

  it("replaces a sentence with an invented number by the template, and logs why", () => {
    const bad = structuredClone(goodGemini);
    bad.picks[0].reason = "Player One has scored 4 centuries and is expected to score 44.3 points.";
    const e = assembleExplanation(facts, bad);
    expect(e.picks.get(1)!.source).toBe("template");
    expect(e.picks.get(1)!.text).toBe(templatePick(facts.picks[0]));
    expect(e.picks.get(2)!.source).toBe("gemini");
    expect(e.report.replacedByTemplate).toBe(1);
    expect(e.report.rejections[0]).toContain("Player One");
    expect(e.report.rejections[0]).toContain("4");
  });

  it("the runner-up must be named: 'the runner-up is behind' with no name is replaced by the template", () => {
    const unnamed = structuredClone(goodGemini);
    unnamed.captain.whyNotRunnerUp = "The runner-up is behind because we expect fewer points from him, 39.4 against 55.4.";
    const e = assembleExplanation(facts, unnamed);
    expect(e.captain.whyNotRunnerUp).toContain("Player Two");
    expect(e.report.rejections.join(" ")).toContain("did not name the runner-up");
  });

  it("a gap marked behind may not be called close (code decides how close it is)", () => {
    expect(facts.context.captaincy!.runnerUp!.howClose).toBe("behind");
    const soft = structuredClone(goodGemini);
    soft.captain.whyNotRunnerUp = "Player Two is just behind, as we expect fewer points from him, 39.4 against 55.4.";
    const e = assembleExplanation(facts, soft);
    expect(e.captain.whyNotRunnerUp).toBe("Player Two was behind: we expect fewer points from him (39.4 against 55.4).");
  });

  it("a genuinely close pair is called close", () => {
    const cap = pick({ playerId: 1, name: "Player One", isCaptain: true, chanceOfPlayingPct: 100, expectedPoints: 50.8, blankMatchesPct: 20 });
    const rival = pick({ playerId: 2, name: "Player Two", chanceOfPlayingPct: 100, expectedPoints: 50.2, blankMatchesPct: 20 });
    expect(buildCaptainCase([cap, rival], ["Player One", "Player Two"])!.runnerUp!.howClose).toBe("very close");
  });

  it("replaces a sentence that borrows another player's number, even though that number is in the facts", () => {
    const borrowed = structuredClone(goodGemini);
    borrowed.picks[0].reason = "Player One is expected to score 39.4 points and scored 76 last time.";
    const e = assembleExplanation(facts, borrowed);
    expect(e.picks.get(1)!.source).toBe("template");
    expect(e.report.rejections[0]).toContain("39.4");
  });

  it("uses a template for a player Gemini forgot", () => {
    const partial = { ...goodGemini, picks: [goodGemini.picks[0]] };
    const e = assembleExplanation(facts, partial);
    expect(e.picks.get(2)!.source).toBe("template");
  });

  it("ignores captain text written about the wrong player id", () => {
    const wrong = { ...goodGemini, captain: { ...goodGemini.captain, playerId: 2 } };
    const e = assembleExplanation(facts, wrong);
    expect(e.captain.source).toBe("template");
  });

  it("if Gemini is down (null), everything is a template and nothing is blank", () => {
    const e = assembleExplanation(facts, null);
    expect(e.report.acceptedFromGemini).toBe(0);
    expect(e.picks.get(1)!.text.length).toBeGreaterThan(20);
    expect(e.pitchReport.source).toBe("template");
    expect(e.summary.text).toContain("seeded");
  });

  it("garbage output (wrong shape) falls back safely", () => {
    expect(() => assembleExplanation(facts, "not json at all")).not.toThrow();
    expect(() => assembleExplanation(facts, { picks: "nope" })).not.toThrow();
  });
});

describe("buildCaptainCase: the reasons, in plain terms, computed by code", () => {
  it("says why the runner-up is behind using real differences", () => {
    const quieter = pick({ playerId: 3, name: "Player Three", role: "BAT", expectedPoints: 55.4, chanceOfPlayingPct: 80, blankMatchesPct: 40, isCaptain: false });
    const cap = pick({ playerId: 1, name: "Player One", isCaptain: true, expectedPoints: 44.3 });
    const c = buildCaptainCase([cap, quieter], ["Player One", "Player Three"])!;
    expect(c.runnerUp!.whyBehind).toBe("he has quiet matches more often (40% of recent matches against 27%)");
  });

  it("combines several reasons, and admits when the two are very close", () => {
    const cap = pick({ playerId: 1, name: "Player One", isCaptain: true, chanceOfPlayingPct: 100, expectedPoints: 50, blankMatchesPct: 20 });
    const worse = pick({ playerId: 2, name: "Player Two", expectedPoints: 40, chanceOfPlayingPct: 90, blankMatchesPct: 35 });
    expect(buildCaptainCase([cap, worse], ["Player One", "Player Two"])!.runnerUp!.whyBehind).toBe(
      "we expect fewer points from him (44.4 against 50) and he has quiet matches more often (35% of recent matches against 20%) and he is less certain to play (90% against 100%)",
    );
    const same = pick({ playerId: 3, name: "Player Three", expectedPoints: 50, chanceOfPlayingPct: 100, blankMatchesPct: 20 });
    expect(buildCaptainCase([cap, same], ["Player One", "Player Three"])!.runnerUp!.whyBehind).toBe("the two are very close and the gap is small");
  });

  it("explains the vice-captain's different route to points, or says he is simply next best", () => {
    expect(facts.context.captaincy!.vice!.routeNote).toBe(
      "he earns points differently from the captain (bowling against batting), so the two do not depend on the same thing",
    );
    const cap = pick({ playerId: 1, isCaptain: true });
    const vice = pick({ playerId: 2, name: "Player Two", role: "BAT", isViceCaptain: true });
    expect(buildCaptainCase([cap, vice], [])!.vice!.routeNote).toBe("he is the next best player after the captain");
  });

  it("describes why each role is trusted with the armband in cricket terms", () => {
    const bowler = pick({ playerId: 1, name: "B", role: "BOWL", isCaptain: true, avgOvers: 3.6, avgBallsFaced: null });
    expect(buildCaptainCase([bowler], [])!.captain.whyEligible).toBe("he is a front-line bowler who averages 3.6 overs a match");
    const ar = pick({ playerId: 1, name: "A", role: "AR", isCaptain: true, avgOvers: 3, avgBallsFaced: 12.5 });
    expect(buildCaptainCase([ar], [])!.captain.whyEligible).toBe("he does both jobs: about 12.5 balls faced and 3 overs bowled a match");
  });

  it("no captain, no case; a lone captain has no runner-up", () => {
    expect(buildCaptainCase([pick({ playerId: 1 })], [])).toBeNull();
    expect(buildCaptainCase([pick({ playerId: 1, isCaptain: true })], ["Player One"])!.runnerUp).toBeNull();
  });

  it("keeps the internal captain score out of the facts entirely", () => {
    expect(JSON.stringify(facts)).not.toMatch(/captainScore|captainRace/);
  });
});

describe("prompt", () => {
  it("contains the facts and the schema covers every part we need", () => {
    const p = buildPrompt(facts);
    expect(p).toContain("Player One");
    expect(p).toContain("captaincy");
    expect(OUTPUT_SCHEMA.required).toEqual(["picks", "captain", "viceCaptain", "pitchReport", "summary"]);
  });
});

describe("gemini client", () => {
  const okBody = {
    steps: [
      { type: "thought", signature: "x" },
      { type: "model_output", content: [{ type: "text", text: "{\"ok\": 7}" }] },
    ],
  };

  it("reads the text from the last model_output step", () => {
    expect(extractText(okBody)).toBe("{\"ok\": 7}");
  });

  it("throws when there is no text", () => {
    expect(() => extractText({ steps: [{ type: "thought" }] })).toThrow("no text");
  });

  it("sends the model, schema and key header, and returns parsed JSON (no network: fetch is faked)", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const result = await generateJson({
      apiKey: "TEST-KEY", system: "sys", input: "in", schema: { type: "object" },
      fetchImpl: async (url, init) => { seen = { url, init }; return new Response(JSON.stringify(okBody), { status: 200 }); },
    });
    expect(result).toEqual({ ok: 7 });
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.response_format).toEqual({ type: "text", mime_type: "application/json", schema: { type: "object" } });
    expect(body.system_instruction).toBe("sys");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("TEST-KEY");
    expect(seen!.url).toContain("/v1beta/interactions");
  });

  it("an HTTP error throws a clear message and never leaks the key", async () => {
    await expect(
      generateJson({ apiKey: "SUPER-SECRET", system: "s", input: "i", schema: {}, fetchImpl: async () => new Response("quota exceeded", { status: 429 }) }),
    ).rejects.toThrow(/HTTP 429 quota exceeded/);
    await generateJson({ apiKey: "SUPER-SECRET", system: "s", input: "i", schema: {}, fetchImpl: async () => new Response("nope", { status: 500 }) }).catch((e) =>
      expect(String(e)).not.toContain("SUPER-SECRET"),
    );
  });
});
