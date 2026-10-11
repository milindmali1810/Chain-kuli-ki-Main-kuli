import { describe, it, expect } from "vitest";
import { extractText, generateJson } from "@/lib/gemini";
import {
  allowedNumbers, assembleExplanation, buildPrompt, checkText, templateCaptain, templatePick, templatePitch,
  templateSummary, templateVice, ungroundedNumbers, type Facts, type PickFacts, OUTPUT_SCHEMA,
} from "@/lib/reasoning";

const pick = (over: Partial<PickFacts>): PickFacts => ({
  playerId: 1, name: "Player One", role: "BAT", team: "Team A", opponent: "Team B", credits: 9.5, expectedPoints: 44.3, rank: 1,
  isCaptain: false, isViceCaptain: false, basePoints: 41.2, recentMean: 47.5, longMean: 38.9, rolePrior: 31.4,
  matchesUsed: 30, lastPoints: [76, 12, 33, 8, 61], venueEffectPct: 2.5, teamFormEffectPct: -1, chanceOfPlayingPct: 80,
  blankMatchesPct: 27, avgBallsFaced: 21.3, avgOvers: null, deathBonusPct: 0, death: null, ...over,
});

const facts: Facts = {
  context: {
    stage: "final", matchLabel: "Team A v Team B", date: { day: 6, month: 10, year: 2026 }, venue: "Test Ground",
    pitch: { tag: "HIGH_SCORING", indexPct: 11.1, matches: 22, lowConfidence: false },
    weather: { tempC: 26.2, humidityPct: 77, dewPointC: 21.8, rainMm: 0, cloudPct: 4.3, windKmh: 6.7 },
    teamFormEffectPct: { "Team A": 6.8, "Team B": -1 }, totalCredits: 99.5, creditCap: 100, creditsAreSeeded: true,
    composition: { byRole: { BAT: 1, BOWL: 1 }, byTeam: { "Team A": 1, "Team B": 1 } },
    deathLog: [], unavailableFactors: ["Batter vs bowler-type matchups"],
    captainRace: [{ name: "Player One", captainScore: 45.1 }, { name: "Player Two", captainScore: 41.4 }],
  },
  picks: [
    pick({ playerId: 1, name: "Player One", isCaptain: true }),
    pick({ playerId: 2, name: "Player Two", role: "BOWL", isViceCaptain: true, expectedPoints: 39.4, lastPoints: [62, 27, 5, 44, 30], avgBallsFaced: null, avgOvers: 3.8, chanceOfPlayingPct: 100 }),
  ],
};
const allowed = allowedNumbers(facts);

describe("number guard", () => {
  it("knows every number in the facts, including those inside text", () => {
    for (const n of [44.3, 76, 6, 10, 2026, 26.2, 77, 22, 41.4, 100]) expect(allowed.has(n)).toBe(true);
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
      templateVice(facts.picks[1]),
      templatePitch(facts.context),
      templateSummary(facts.context),
    ];
    for (const t of texts) expect(ungroundedNumbers(t, allowed), t).toEqual([]);
  });

  it("the template names the runner-up and the scores", () => {
    const c = templateCaptain(facts, facts.picks[0]);
    expect(c.reason).toContain("45.1");
    expect(c.whyNotRunnerUp).toContain("Player Two");
    expect(c.whyNotRunnerUp).toContain("41.4");
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
  captain: { playerId: 1, reason: "Captain score 45.1, the highest, with 80% chance of playing.", whyNotRunnerUp: "Player Two scored 41.4, lower." },
  viceCaptain: { playerId: 2, reason: "Player Two is expected to score 39.4 points and plays with certainty at 100%." },
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

describe("prompt", () => {
  it("contains the facts and the schema covers every part we need", () => {
    const p = buildPrompt(facts);
    expect(p).toContain("Player One");
    expect(p).toContain("captainRace");
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
