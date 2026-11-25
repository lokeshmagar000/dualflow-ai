import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { prepareV2 } from "./v2build";

const words = [
  { text: "Every", startMs: 0, endMs: 300 },
  { text: "flag", startMs: 300, endMs: 600 },
  { text: "except", startMs: 1000, endMs: 1400 },
  { text: "Nepal's.", startMs: 4000, endMs: 4500 },
];

async function job() {
  const dir = await mkdtemp(path.join(tmpdir(), "v2-"));
  return { dir, url: (n: string) => `http://x/${n}` };
}

test("V2 props: hook, key words that were really spoken, card, riser before the payoff", async () => {
  const props = await prepareV2({
    job: await job(),
    language: "en",
    audioFile: "http://x/voice.wav",
    durationMs: 9000,
    words,
    lines: [
      { order: 1, purpose: "hook", startMs: 0, endMs: 1400 },
      { order: 2, purpose: "point", startMs: 1500, endMs: 3000 },
      { order: 3, purpose: "open_loop", startMs: 3100, endMs: 3900 },
      { order: 4, purpose: "payoff", startMs: 4000, endMs: 6000 },
      { order: 5, purpose: "loop_back", startMs: 6100, endMs: 9000 },
    ],
    shots: [
      { startMs: 0, endMs: 1500, media: null },
      { startMs: 1500, endMs: 9000, media: null },
    ],
    text: {
      hookLines: ["Only 1 flag", "breaks the rule"],
      hookHighlight: 0,
      topicChip: "Nepal's flag",
      emphasis: ["Nepal's", "invented"],
      numberCard: { order: 2, big: "1 / 193", small: "countries" },
      followText: "",
    },
    fallbackHook: "Nepal flag",
    brand: "Namaste Facts",
    brandTag: "",
  });
  assert.deepEqual(props.hook.lines, ["Only 1 flag", "breaks the rule"]);
  assert.deepEqual(props.emphasis, ["nepals"]); // "invented" was never spoken
  assert.equal(props.cards.length, 1);
  assert.equal(props.follow?.atMs, 3100);
  assert.equal(props.follow?.text, "Follow for Part 2");
  assert.ok(props.sfx.some((s) => s.src.endsWith("riser.wav") && s.atMs === 2800));
  assert.ok(props.sfx.some((s) => s.src.endsWith("whoosh.wav")));
});

test("V2 props: older scripts without on-screen text still work", async () => {
  const props = await prepareV2({
    job: await job(),
    language: "ne",
    audioFile: "a",
    durationMs: 3000,
    words,
    lines: [{ order: 1, purpose: "hook", startMs: 0, endMs: 3000 }],
    shots: [{ startMs: 0, endMs: 3000, media: null }],
    text: null,
    fallbackHook: "सगरमाथा",
    brand: "Namaste Facts",
    brandTag: "नेपाली",
  });
  assert.deepEqual(props.hook.lines, ["सगरमाथा"]);
  assert.equal(props.cards.length, 0);
  assert.equal(props.follow, null);
});
