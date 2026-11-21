import assert from "node:assert/strict";
import { test } from "node:test";
import { introSettings, introSoundWav } from "./intro";
import { buildPages, wordsFromCues } from "./remotion/WordPop";
import { introFrames, storyStartFrame } from "./types";

test("intro is on by default and shows the brand in the video's language", () => {
  const ne = introSettings("ne", {});
  assert.equal(ne?.text, "नमस्ते फ्याक्ट्स");
  assert.equal(ne?.tagline, "सानो तथ्य, ठूलो अचम्म");
  assert.equal(ne?.seconds, 2);
  assert.equal(ne?.sound, "on");
  const en = introSettings("en", { CHANNEL_NAME: "Old name is ignored" });
  assert.equal(en?.text, "Namaste Facts");
  assert.equal(en?.tagline, "Small facts, big wonder");
});

test("intro text and tagline can differ per language", () => {
  const env = { BRAND_NAME_EN: "X", INTRO_TEXT_NE: "मेरो च्यानल", INTRO_TAGLINE_EN: "Daily facts" };
  assert.equal(introSettings("ne", env)?.text, "मेरो च्यानल");
  assert.equal(introSettings("en", env)?.text, "X");
  assert.equal(introSettings("en", env)?.tagline, "Daily facts");
});

test("INTRO_SECONDS=0 switches the intro off", () => {
  assert.equal(introSettings("en", { INTRO_SECONDS: "0" }), null);
});

test("intro sound is a valid WAV of the right length", () => {
  const wav = introSoundWav(2);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal((wav.length - 44) / 2, 88200);
});

test("story starts just before the intro ends", () => {
  const p = { intro: { text: "A", durationMs: 2000 } };
  assert.equal(introFrames(p), 60);
  assert.equal(storyStartFrame(p), 51);
  assert.equal(storyStartFrame({ intro: null }), 0);
});

test("word pop groups: at most 3 words, never across a sentence end", () => {
  const w = (text: string, i: number) => ({ text, startMs: i * 300, endMs: i * 300 + 250 });
  const words = ["नेपालको", "पर्यटन", "क्षेत्र", "बढ्दैछ।", "सगरमाथा", "अग्लो"].map(w);
  const pages = buildPages(words).map((p) => p.words.map((x) => x.text).join(" "));
  assert.deepEqual(pages, ["नेपालको पर्यटन क्षेत्र", "बढ्दैछ।", "सगरमाथा अग्लो"]);
});

test("words from cues are spread over the line", () => {
  const words = wordsFromCues([{ startMs: 0, endMs: 900, text: "one two three" }]);
  assert.deepEqual(words.map((w) => w.startMs), [0, 300, 600]);
});
