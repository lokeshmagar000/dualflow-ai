/**
 * Tests for the voice package. Run with: pnpm --filter @dualflow/voice test
 * Each test() checks one small promise the code makes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCues, formatTime, toSrt, toVtt } from "./subtitles";
import { pcmToWav, wavToPcm, silence, pcmDurationMs } from "./wav";
import { makeVoiceover, SCENE_GAP_MS } from "./voiceover";
import { mockVoice } from "./mock";
import { escapeXml } from "./azure";

test("formatTime writes SRT and VTT times", () => {
  assert.equal(formatTime(3_723_004), "01:02:03,004");
  assert.equal(formatTime(1500, "."), "00:00:01.500");
});

test("a WAV file keeps its audio after header is added and removed", () => {
  const pcm = silence(1000);
  assert.equal(pcmDurationMs(pcm), 1000);
  assert.deepEqual(wavToPcm(pcmToWav(pcm)), pcm);
});

test("cues break after a Nepali danda (।) and an English full stop", () => {
  const words = ["नमस्ते", "साथीहरू।", "Hello", "friends."].map((text, i) => ({
    text,
    startMs: i * 500,
    endMs: i * 500 + 400,
  }));
  const cues = buildCues(words);
  assert.deepEqual(cues.map((c) => c.text), ["नमस्ते साथीहरू।", "Hello friends."]);
});

test("long text is split into short cues", () => {
  const words = Array.from({ length: 30 }, (_, i) => ({ text: "word", startMs: i * 300, endMs: i * 300 + 250 }));
  const cues = buildCues(words, { maxChars: 20 });
  assert.ok(cues.length > 1);
  for (const c of cues) assert.ok(c.text.length <= 20, c.text);
});

test("SRT and VTT look right", () => {
  const cues = [{ startMs: 0, endMs: 1200, text: "नमस्ते" }];
  assert.equal(toSrt(cues), "1\n00:00:00,000 --> 00:00:01,200\nनमस्ते\n");
  assert.ok(toVtt(cues).startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:01.200\nनमस्ते"));
});

test("voiceover glues scenes in order with a pause between them", async () => {
  const vo = await makeVoiceover(mockVoice, "ne", [
    { order: 1, text: "पहिलो दृश्य।" },
    { order: 2, text: "दोस्रो दृश्य।" },
  ]);
  const [one, two] = vo.scenes;
  assert.equal(one!.startMs, 0);
  assert.equal(two!.startMs, one!.endMs + SCENE_GAP_MS);
  assert.equal(vo.durationMs, two!.endMs);
  // Every word of scene 2 is inside scene 2's time.
  const sceneTwoWords = vo.words.slice(2);
  for (const w of sceneTwoWords) assert.ok(w.startMs >= two!.startMs && w.endMs <= two!.endMs);
  assert.ok(vo.srt.includes("दोस्रो दृश्य।"));
});

test("SSML text is escaped so & and < cannot break the XML", () => {
  assert.equal(escapeXml(`Tom & "Jerry" <3`), "Tom &amp; &quot;Jerry&quot; &lt;3");
});
