import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanTag, findHashtags, mergeHashtags, parseHashtags } from "./hashtags";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("cleanTag keeps Nepali letters and removes spaces and symbols", () => {
  assert.equal(cleanTag("#नेपाल"), "नेपाल");
  assert.equal(cleanTag("did you know?"), "didyouknow");
  assert.equal(cleanTag("##Mount-Everest"), "MountEverest");
});

test("parseHashtags reads tags from Gemini's answer", () => {
  assert.deepEqual(parseHashtags("Here: #Everest #सगरमाथा, #nepal_trek and #8849m."), ["Everest", "सगरमाथा", "nepal_trek", "8849m"]);
});

test("mergeHashtags: best trending first, then brand, no repeats, at most 15", () => {
  const tags = mergeHashtags({
    language: "en",
    format: "SHORT",
    trending: ["Everest", "MountEverest", "everest", "Himalayas", ...Array.from({ length: 20 }, (_, i) => `t${i}`)],
    script: ["Nepal"],
    brand: ["NamasteFacts"],
  });
  assert.deepEqual(tags.slice(0, 5), ["Everest", "MountEverest", "NamasteFacts", "shorts", "Himalayas"]);
  assert.equal(tags.length, 15);
  assert.equal(new Set(tags.map((t) => t.toLowerCase())).size, 15);
});

test("findHashtags searches with Gemini and falls back when it fails", async () => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.AI_MODE;
  delete process.env.HASHTAG_SEARCH;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "#सगरमाथा #everest #नेपाल" }] } }] }));
  }) as typeof fetch;
  const ok = await findHashtags({ language: "ne", format: "SHORT", title: "सगरमाथा", summary: "s", scriptHashtags: ["हिमाल"] });
  assert.deepEqual(bodies[0].tools, [{ google_search: {} }]);
  assert.deepEqual(ok.hashtags.slice(0, 4), ["सगरमाथा", "everest", "NamasteFacts", "नमस्तेफ्याक्ट्स"]);
  assert.ok(ok.hashtags.includes("हिमाल"));
  assert.equal(ok.costs.length, 1);

  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
  const fallback = await findHashtags({ language: "en", format: "LONG", title: "x", summary: "s", scriptHashtags: ["Everest"] });
  assert.deepEqual(fallback.hashtags.slice(0, 2), ["NamasteFacts", "Everest"]);
  assert.equal(fallback.costs.length, 0);
});
