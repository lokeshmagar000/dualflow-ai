import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { cardKind, prepareV2, splitLongShots } from "./v2build";

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
      cards: [
        { order: 2, kind: "number", big: "1 / 193", small: "countries" },
        { order: 4, kind: "date", big: "16 December 1962", small: "flag adopted" },
      ],
      followText: "",
    },
    fallbackHook: "Nepal flag",
    brand: "Namaste Facts",
    brandTag: "",
  });
  assert.deepEqual(props.hook.lines, ["Only 1 flag", "breaks the rule"]);
  assert.deepEqual(props.emphasis, ["nepals"]); // "invented" was never spoken
  assert.equal(props.cards.length, 2);
  assert.equal(props.cards[0]!.startMs, 2700); // waits until the hook text is gone
  assert.equal(props.cards[1]!.kind, "date");
  assert.ok(props.cards[0]!.endMs < props.cards[1]!.startMs); // never two cards at once
  assert.equal(props.sfx.filter((s) => s.src.endsWith("ding.wav")).length, 2);
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

test("card kind is guessed from the text when the script did not say", () => {
  assert.equal(cardKind("10:30"), "time");
  assert.equal(cardKind("1962"), "year");
  assert.equal(cardKind("8,849 m"), "number");
  assert.equal(cardKind("1962", "date"), "date");
});

test("long shots are cut into pieces so one picture never stays too long", () => {
  const out = splitLongShots([
    { startMs: 0, endMs: 2000, q: "a" },
    { startMs: 2000, endMs: 9000, q: "b" },
  ]);
  assert.equal(out[0]!.extra, false);
  assert.ok(out.length >= 4);
  assert.equal(out.filter((s) => !s.extra).length, 2);
  assert.equal(out.at(-1)!.endMs, 9000);
  for (const s of out) assert.ok(s.endMs - s.startMs <= 3200);
  assert.equal(out[1]!.q, "b");
});
