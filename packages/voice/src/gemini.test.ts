/**
 * Tests for the Gemini voice, with a fake fetch (no key, no internet).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { geminiVoice, splitAtPauses, fitWords, VoiceQuotaError } from "./gemini";
import { makeVoiceover } from "./voiceover";
import { pcmDurationMs, SAMPLE_RATE, silence } from "./wav";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A loud tone of `ms` milliseconds (stands in for speech). */
function tone(ms: number): Buffer {
  const samples = Math.round((SAMPLE_RATE * ms) / 1000);
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin(i / 5) * 8000), i * 2);
  return buf;
}

/** Fake Gemini: answers every request with `pcm`, and remembers the requests. */
function fakeGemini(pcm: Buffer, status = 200) {
  const calls: any[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(String(init.body)) });
    if (status !== 200) return new Response('{"error":{"code":429}}', { status });
    const body = { candidates: [{ content: { parts: [{ inlineData: { data: pcm.toString("base64") } }] } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return calls;
}

test("cuts one recording into scenes at the pauses", () => {
  // Three "scenes" of speech (1 s, 2 s, 1 s) with 600 ms pauses between them.
  const pcm = Buffer.concat([tone(1000), silence(600), tone(2000), silence(600), tone(1000)]);
  const parts = splitAtPauses(pcm, [10, 20, 10]);
  const lengths = parts.map(pcmDurationMs);
  assert.equal(parts.length, 3);
  // Each cut lands in the middle of a pause: 1000+300, 300+2000+300, 300+1000.
  assert.ok(Math.abs(lengths[0]! - 1300) <= 40, `first ${lengths[0]}`);
  assert.ok(Math.abs(lengths[1]! - 2600) <= 40, `second ${lengths[1]}`);
  assert.ok(Math.abs(lengths[2]! - 1300) <= 40, `third ${lengths[2]}`);
});

test("word times are stretched to fit the real audio length", () => {
  const words = fitWords("नमस्ते साथीहरू आज", "ne", 3000);
  assert.equal(words.length, 3);
  assert.ok(words[0]!.startMs >= 0);
  assert.ok(words.at(-1)!.endMs <= 3000 && words.at(-1)!.endMs > 2500);
});

test("all scenes go in ONE request (saves the free daily limit)", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const pcm = Buffer.concat([tone(1000), silence(600), tone(1000)]);
  const calls = fakeGemini(pcm);
  const vo = await makeVoiceover(geminiVoice(), "ne", [
    { order: 1, text: "नमस्ते साथीहरू" },
    { order: 2, text: "फलो गर्नुहोस्" },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(vo.requests, 1);
  assert.equal(vo.scenes.length, 2);
  assert.equal(calls[0].headers["x-goog-api-key"], "test-key"); // key in a header, not the URL
  assert.ok(!String(calls[0].url).includes("test-key"));
  const body = calls[0].body;
  assert.deepEqual(body.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.match(body.contents[0].parts[0].text, /नमस्ते साथीहरू\n\nफलो गर्नुहोस्/);
  assert.ok(vo.cues.length > 0); // subtitles were made
});

test("a used-up free limit (429) becomes VoiceQuotaError", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  fakeGemini(Buffer.alloc(0), 429);
  await assert.rejects(geminiVoice().speak("नमस्ते", "ne"), VoiceQuotaError);
});
