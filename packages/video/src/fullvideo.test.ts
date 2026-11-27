import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { clipProps, keepClearOf, pickClipWindows, prepareV2 } from "./v2build";

/** 20 lines of 5 seconds each (line 1 = 0-5 s, line 2 = 5-10 s ...). */
const lines = Array.from({ length: 20 }, (_, i) => ({ order: i + 1, purpose: i === 0 ? "hook" : "point", startMs: i * 5000, endMs: i * 5000 + 4800 }));

test("full video: shorts are whole chapters of 25-75 s, longest first, back in time order", () => {
  const chapters = [
    { firstOrder: 2, lastOrder: 4, title: "Too short" }, // 15 s: skipped
    { firstOrder: 5, lastOrder: 11, title: "Seven lines" }, // 35 s
    { firstOrder: 12, lastOrder: 20, title: "Nine lines" }, // 45 s
  ];
  const w = pickClipWindows(chapters, lines, 3);
  assert.deepEqual(w.map((x) => x.title), ["Seven lines", "Nine lines"]);
  assert.equal(w[0]!.fromMs, 20000 - 150);
  assert.equal(w[0]!.toMs, 10 * 5000 + 4800 + 350);
  // At most 1: the longest one wins.
  assert.deepEqual(pickClipWindows(chapters, lines, 1).map((x) => x.title), ["Nine lines"]);
});

test("full video: a chapter longer than 75 s is cut at a line end", () => {
  const w = pickClipWindows([{ firstOrder: 1, lastOrder: 20, title: "All" }], lines, 3);
  assert.equal(w.length, 1);
  assert.ok(w[0]!.toMs - w[0]!.fromMs <= 75_000 + 500);
  assert.equal((w[0]!.toMs - 350) % 5000, 4800); // ends where a line ends
});

test("full video: cards move out of the way of a chapter title", () => {
  const out = keepClearOf(
    [
      { startMs: 1000, endMs: 4000 }, // starts in the title: moved to 3300, still 700 ms -> dropped
      { startMs: 2000, endMs: 9000 }, // moved to 3300
      { startMs: 5000, endMs: 7000 }, // untouched
    ],
    [{ startMs: 0, endMs: 3300 }],
  );
  assert.deepEqual(out, [{ startMs: 3300, endMs: 9000 }, { startMs: 5000, endMs: 7000 }]);
});

test("full video: wide props with chapters and a subscribe pill; a short cut from it starts at 0", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "full-"));
  const words = lines.flatMap((l) => [{ text: `w${l.order}`, startMs: l.startMs + 100, endMs: l.startMs + 900 }]);
  const full = await prepareV2({
    job: { dir, url: (n) => `http://x/${n}` },
    language: "en",
    audioFile: "http://x/voice.wav",
    durationMs: 100_000,
    words,
    lines,
    shots: lines.map((l) => ({ startMs: l.startMs, endMs: l.endMs, media: null })),
    text: { hookLines: ["Why Delhi?"], topicChip: "India visit", cards: [{ order: 6, kind: "number", big: "19", small: "agreements" }] },
    fallbackHook: "x",
    brand: "Namaste Facts",
    brandTag: "",
    wide: true,
    chapters: [{ order: 5, title: "What was signed" }, { order: 1, title: "On the hook: never shown" }],
    maxCards: 8,
    follow: { atMs: 40_000, text: "Subscribe for more" },
  });
  assert.equal(full.wide, true);
  assert.deepEqual(full.chapters, [{ title: "What was signed", startMs: 20000, n: 1 }]);
  assert.deepEqual(full.follow, { atMs: 40_000, text: "Subscribe for more" });
  assert.equal(full.cards.length, 1);

  const short = clipProps(full, 20_000, 50_000, { audioFile: "http://x/short-1.wav", hookLines: ["What was", "signed"] });
  assert.equal(short.wide, false);
  assert.equal(short.durationMs, 30_000);
  assert.deepEqual(short.chapters, []);
  assert.deepEqual(short.hook, { lines: ["What was", "signed"], highlight: 1 });
  assert.equal(short.words[0]!.text, "w5");
  assert.equal(short.words[0]!.startMs, 100);
  assert.ok(short.shots.every((s) => s.startMs >= 0 && s.endMs <= 30_000));
  // The card (line 6 = 25 s in the full video) is now at about 5 s, after the hook text.
  assert.ok(short.cards[0]!.startMs >= 2700 && short.cards[0]!.startMs < 6000);
  assert.equal(short.sfx[0]!.atMs, 0); // the opening hit
});
