import { sourced } from "./sourced";

// Runtime AI is Gemini Flash only. Never the Claude API. Gemini writes explanation text; it never picks players.
export const AI = {
  model: sourced(
    "gemini-3.8-flash",
    "certain",
    "ai.google.dev/gemini-api/docs/models: latest stable Flash model, checked 11 Oct 2026",
  ),
  endpoint: sourced(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    "certain",
    "ai.google.dev/gemini-api/docs/text-generation (Interactions API), tested live 11 Oct 2026",
  ),
  timeoutMs: sourced(60000, "guessing", "v1 choice"),
};
