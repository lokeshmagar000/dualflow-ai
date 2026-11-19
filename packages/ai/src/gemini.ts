/**
 * FREE AI: Google Gemini (AI_PROVIDER=gemini).
 *
 * We call Gemini's REST API with plain fetch (no extra library).
 * Free tier: a small number of requests per day (Google changes it often;
 * check your limit in Google AI Studio). Every call is recorded as a
 * "request" with a cost of $0, so the Costs page can show how much of the
 * free daily limit is used.
 *
 * Key: GEMINI_API_KEY. Model: GEMINI_MODEL (default "gemini-flash-latest",
 * Google's name for its newest Flash model).
 */
import { z } from "zod/v4";
import { ConfigError } from "./client";
import type { CostLine } from "./cost";
import { AIQuotaError, nextQuotaReset } from "./provider";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
/** Used when the main model is busy (HTTP 503). Flash-Lite is lighter and usually free of queues. */
export const DEFAULT_GEMINI_FALLBACK = "gemini-flash-lite-latest";

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/** One web page Gemini used when "Google Search grounding" is on. */
export interface GeminiSource {
  url: string;
  title: string;
}

export interface GeminiResult {
  text: string;
  sources: GeminiSource[];
  cost: CostLine;
}

/** The parts of Gemini's answer that we read. */
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Turn a zod schema into the JSON Schema Gemini understands.
 * Gemini does not want the "$schema" line, so we remove it.
 */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Seconds Google asks us to wait (from a 429 answer's RetryInfo), or null. */
function retryDelaySeconds(errorBody: string): number | null {
  const m = errorBody.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) : null;
}

/** How long to wait for one Gemini answer (GEMINI_TIMEOUT_SECONDS, default 60). */
function timeoutMs(): number {
  return Number(process.env.GEMINI_TIMEOUT_SECONDS ?? 60) * 1000;
}

/**
 * Ask Gemini. With `search: true` Gemini searches Google first (for research).
 *
 * Free models are sometimes busy (503) or out of free quota for one model or
 * for Google Search (429). Before giving up we try, in order:
 *   main model (with search) -> Flash-Lite (with search)
 *   -> main model (no search) -> Flash-Lite (no search)
 */
export async function askGemini(opts: {
  system: string;
  prompt: string;
  search?: boolean;
  jsonSchema?: Record<string, unknown>;
}): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new ConfigError(
      "AI_PROVIDER=gemini needs GEMINI_API_KEY (free from Google AI Studio). Or set AI_PROVIDER=mock to practise.",
    );
  }
  const main = geminiModel();
  const fallback = process.env.GEMINI_FALLBACK_MODEL ?? DEFAULT_GEMINI_FALLBACK;
  const models = fallback && fallback !== main ? [main, fallback] : [main];
  const tries: { model: string; search: boolean }[] = models.map((model) => ({ model, search: Boolean(opts.search) }));
  if (opts.search) tries.push(...models.map((model) => ({ model, search: false })));

  let lastStatus = 0;
  let lastDetails = "";
  for (const { model, search } of tries) {
    const body = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      ...(search ? { tools: [{ google_search: {} }] } : {}),
      ...(opts.jsonSchema
        ? { generationConfig: { responseMimeType: "application/json", responseJsonSchema: opts.jsonSchema } }
        : {}),
    };
    // The key goes in a header (not the URL), so it never shows up in logs.
    let res: Response;
    try {
      res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs()),
      });
    } catch (err) {
      // No answer in time (Google Search sometimes hangs on the free tier): try the next option.
      const name = (err as Error).name;
      if (name === "TimeoutError" || name === "AbortError") {
        console.warn(`Gemini: ${model}${search ? " with search" : ""} did not answer in time, trying the next option.`);
        lastStatus = 0;
        lastDetails = "timeout";
        continue;
      }
      throw err;
    }

    if (res.ok) {
      const data = (await res.json()) as GeminiResponse;
      if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (!text) throw new Error(`Gemini returned no text (finish reason: ${candidate?.finishReason ?? "unknown"}).`);
      const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => ({ url: c.web?.uri ?? "", title: c.web?.title ?? "" }))
        .filter((s) => s.url);
      if (opts.search && !search) console.warn("Gemini: Google Search was not available, research used no web search.");
      return { text, sources, cost: { provider: `gemini:${model}`, units: 1, unitType: "requests", usd: 0 } };
    }

    lastStatus = res.status;
    lastDetails = await res.text();
    if (res.status === 503 || res.status === 429) continue; // busy or out of quota: try the next option
    // Wrong key, wrong model name or a bad request: retrying will not fix it.
    if ([400, 401, 403, 404].includes(res.status)) throw new ConfigError(`Gemini error ${res.status}: ${lastDetails.slice(0, 500)}`);
    throw new Error(`Gemini error ${res.status}: ${lastDetails.slice(0, 300)}`); // 500s: retry later
  }

  if (lastStatus === 429) {
    const wait = retryDelaySeconds(lastDetails);
    // A short wait means "too many per minute": the queue retries soon.
    if (wait !== null && wait <= 120 && !/PerDay/i.test(lastDetails)) {
      throw new Error(`Gemini free limit per minute reached. Will retry in about ${Math.ceil(wait)} s.`);
    }
    // Otherwise the free DAILY limit is used up: wait for tomorrow.
    throw new AIQuotaError("Gemini free daily limit reached. Will continue after it resets.", nextQuotaReset());
  }
  if (lastStatus === 0) throw new Error("Gemini did not answer in time. Will retry.");
  throw new Error(`Gemini is busy right now (HTTP ${lastStatus}). Will retry.`);
}

/** Ask Gemini for JSON that matches a zod schema, and check the answer. */
export async function askGeminiJson<T>(
  schema: z.ZodType<T>,
  opts: { system: string; prompt: string },
): Promise<{ value: T; cost: CostLine }> {
  const result = await askGemini({ ...opts, jsonSchema: toGeminiSchema(schema) });
  let raw: unknown;
  try {
    raw = JSON.parse(result.text);
  } catch {
    throw new Error("Gemini did not return valid JSON. Will retry.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`Gemini's answer did not match the expected shape: ${parsed.error.message.slice(0, 300)}`);
  return { value: parsed.data, cost: result.cost };
}
