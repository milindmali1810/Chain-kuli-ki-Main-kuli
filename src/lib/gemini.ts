import { AI } from "@/config/ai";

// A thin client for the Gemini Interactions API. Server-side only: it reads the API key you pass in.
// Used only to write explanation text from numbers the engine already produced.

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GenerateJsonOptions {
  apiKey: string;
  system: string;
  input: string;
  schema: Record<string, unknown>; // JSON Schema for the answer
  model?: string;
  fetchImpl?: FetchLike; // injectable so tests never touch the network
}

// The reply holds "steps"; the answer is the last step of type "model_output", made of text parts.
export function extractText(body: unknown): string {
  const steps = (body as { steps?: { type?: string; content?: { type?: string; text?: string }[] }[] })?.steps ?? [];
  const output = [...steps].reverse().find((s) => s.type === "model_output");
  const text = (output?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

export async function generateJson(opts: GenerateJsonOptions): Promise<unknown> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI.timeoutMs.value);
  try {
    const res = await doFetch(AI.endpoint.value, {
      method: "POST",
      headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model ?? AI.model.value,
        system_instruction: opts.system,
        input: opts.input,
        response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
      }),
    });
    if (!res.ok) {
      // Never echo the key. The status and a short message are enough to diagnose.
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`Gemini request failed: HTTP ${res.status} ${detail}`);
    }
    return JSON.parse(extractText(await res.json()));
  } finally {
    clearTimeout(timer);
  }
}
