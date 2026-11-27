/**
 * Tests for the free Gemini provider. We replace fetch with a fake one,
 * so the tests need no key and no internet.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeScript } from "./script";
import { researchTopic } from "./research";
import { AIQuotaError, nextQuotaReset } from "./provider";
import { toGeminiSchema } from "./gemini";
import { ScriptSchema } from "./script";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A fake fetch that remembers the requests and answers with the given replies, in order. */
function fakeFetch(replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const reply = replies[calls.length - 1] ?? replies[replies.length - 1]!;
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status ?? 200 });
  }) as typeof fetch;
  return calls;
}
const answer = (text: string, extra: object = {}) => ({ candidates: [{ content: { parts: [{ text }] }, ...extra }] });

const research = {
  summary: "Everest facts",
  facts: [{ claim: "Everest is 8,849 m tall", sourceUrl: "https://example.com" }],
  visualPlan: [
    { purpose: "hook" as const, idea: "Hook", visualQuery: "everest", backupQuery: "mountain", mustShow: "Mount Everest" },
    { purpose: "call_to_action" as const, idea: "Follow", visualQuery: "phone", backupQuery: "phone", mustShow: "a phone" },
  ],
  focus: "Mount Everest",
  broll: [], chapters: [],
  thumbnailQuery: "mount everest",
};

function useGemini() {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.AI_MODE;
}

test("writes a Nepali script with Gemini and normalises the Unicode", async () => {
  useGemini();
  // Gemini answers in JSON; we check its shape and store the text in NFC form.
  const script = {
    title: "सगरमाथा",
    description: "विवरण",
    hashtags: ["नेपाल"],
    thumbnailHeadline: "सगरमाथा",
    scenes: [
      { order: 1, text: "नमस्ते", parts: [] },
      { order: 2, text: "फलो गर्नुहोस्", parts: [] },
    ],
  };
  const calls = fakeFetch([{ body: answer(JSON.stringify(script)) }]);
  const out = await writeScript({ language: "ne", title: "Everest", format: "SHORT", research });

  assert.equal(out.script.scenes.length, 2);
  assert.equal(out.costs[0]!.usd, 0); // free tier
  assert.equal(out.costs[0]!.unitType, "requests");
  // The key is sent in a header, never in the URL.
  assert.equal(calls[0]!.headers["x-goog-api-key"], "test-key");
  assert.ok(!calls[0]!.url.includes("test-key"));
  assert.equal(calls[0]!.body.generationConfig.responseMimeType, "application/json");
  assert.match(calls[0]!.body.systemInstruction.parts[0].text, /Nepali/);
});

test("research uses Google Search first, then asks for the JSON plan", async () => {
  useGemini();
  const calls = fakeFetch([
    { body: answer("Notes about Everest", { groundingMetadata: { groundingChunks: [{ web: { uri: "https://src.example", title: "Src" } }] } }) },
    { body: answer(JSON.stringify(research)) },
  ]);
  const out = await researchTopic({ title: "Everest", format: "SHORT" });
  assert.equal(out.research.visualPlan.length, 2);
  assert.equal(out.costs.length, 2);
  assert.deepEqual(calls[0]!.body.tools, [{ google_search: {} }]);
  assert.match(calls[1]!.body.contents[0].parts[0].text, /https:\/\/src\.example/); // sources passed on
});

test("a used-up daily limit becomes AIQuotaError (wait for tomorrow, not a failure)", async () => {
  useGemini();
  fakeFetch([{ status: 429, body: { error: { message: "Quota exceeded for GenerateRequestsPerDayPerProjectPerModel-FreeTier" } } }]);
  await assert.rejects(writeScript({ language: "en", title: "Everest", format: "SHORT", research }), AIQuotaError);
});

test("a busy model (503) falls back to Flash-Lite", async () => {
  useGemini();
  const calls = fakeFetch([
    { status: 503, body: { error: { message: "high demand" } } },
    { body: answer(JSON.stringify({ title: "t", description: "d", hashtags: [], thumbnailHeadline: "h", scenes: [{ order: 1, text: "x", parts: [] }] })) },
  ]);
  const out = await writeScript({ language: "en", title: "Everest", format: "SHORT", research });
  assert.match(calls[1]!.url, /gemini-flash-lite-latest/);
  assert.match(out.costs[0]!.provider, /flash-lite/);
});

test("research without free Google Search quota falls back to no search", async () => {
  useGemini();
  const quota = { status: 429, body: { error: { code: 429, message: "You exceeded your current quota" } } };
  const calls = fakeFetch([quota, quota, { body: answer("Notes without search") }, { body: answer(JSON.stringify(research)) }]);
  const out = await researchTopic({ title: "Everest", format: "SHORT" });
  assert.equal(out.research.visualPlan.length, 2);
  assert.deepEqual(calls[0]!.body.tools, [{ google_search: {} }]);
  assert.deepEqual(calls[1]!.body.tools, [{ google_search: {} }]);
  assert.equal(calls[2]!.body.tools, undefined); // third try: no search
});

test("a request that hangs (timeout) moves on to the next option", async () => {
  useGemini();
  let n = 0;
  globalThis.fetch = (async () => {
    n++;
    if (n === 1) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    return new Response(JSON.stringify(answer(n === 2 ? "Notes" : JSON.stringify(research))), { status: 200 });
  }) as typeof fetch;
  const out = await researchTopic({ title: "Everest", format: "SHORT" });
  assert.equal(out.research.visualPlan.length, 2);
  assert.equal(n, 3); // hung try, then notes from the next option, then the plan
});

test("a short per-minute limit is retried soon, not postponed to tomorrow", async () => {
  useGemini();
  fakeFetch([{ status: 429, body: '{"error":{"details":[{"retryDelay":"20s"}]}}' }]);
  await assert.rejects(writeScript({ language: "en", title: "Everest", format: "SHORT", research }), (e: Error) =>
    !(e instanceof AIQuotaError) && /per minute/.test(e.message),
  );
});

test("bad JSON from Gemini is an error that will be retried", async () => {
  useGemini();
  fakeFetch([{ body: answer("not json") }]);
  await assert.rejects(writeScript({ language: "en", title: "Everest", format: "SHORT", research }), /valid JSON/);
});

test("the schema sent to Gemini has no $schema line", () => {
  const schema = toGeminiSchema(ScriptSchema);
  assert.equal(schema.$schema, undefined);
  assert.equal(schema.type, "object");
});

test("quota resets just after midnight Pacific (08:05 UTC)", () => {
  assert.equal(nextQuotaReset(new Date("2026-11-19T07:00:00Z")).toISOString(), "2026-11-19T08:05:00.000Z");
  assert.equal(nextQuotaReset(new Date("2026-11-19T09:00:00Z")).toISOString(), "2026-11-20T08:05:00.000Z");
});
