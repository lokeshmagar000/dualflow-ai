/**
 * Tests for splitting long lines into two pictures at a sentence end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planShots } from "./shots";

const word = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

test("a short line keeps one picture", () => {
  const shots = planShots([{ order: 1, text: "Short line.", startMs: 0, endMs: 3000 }], [word("Short", 100, 600), word("line.", 700, 1200)]);
  assert.equal(shots.length, 1);
  assert.equal(shots[0]!.part, 0);
});

test("a long line gets a second picture right between its two sentences", () => {
  const words = [
    word("Everest", 0, 800), word("is", 900, 1100), word("growing.", 1200, 4200),
    word("Four", 4600, 5200), word("millimetres", 5300, 7000), word("yearly.", 7100, 9000),
  ];
  const shots = planShots([{ order: 3, text: "Everest is growing. Four millimetres yearly.", startMs: 0, endMs: 9200 }], words);
  assert.equal(shots.length, 2);
  assert.equal(shots[0]!.endMs, 4400); // halfway in the pause between "growing." and "Four"
  assert.equal(shots[1]!.startMs, 4400);
  assert.equal(shots[1]!.text, "Four millimetres yearly.");
  assert.deepEqual(shots.map((s) => [s.order, s.part]), [[3, 0], [3, 1]]);
});

test("no sentence end in a long line: one picture (never cut mid-sentence)", () => {
  const words = [word("one", 0, 3000), word("long", 3100, 6000), word("sentence", 6100, 9000)];
  assert.equal(planShots([{ order: 1, text: "x", startMs: 0, endMs: 9000 }], words).length, 1);
});

test("parts: the picture changes at the word where the next part starts", () => {
  const words = [
    word("Yaks", 0, 400), word("live", 500, 800), word("in", 900, 1000), word("the", 1100, 1200),
    word("high", 1300, 1600), word("Himalaya,", 1700, 2400),
    word("above", 2600, 3000), word("the", 3100, 3200), word("forests", 3300, 3800),
    word("and", 3900, 4000), word("jungles.", 4100, 4800),
  ];
  const shots = planShots(
    [{
      order: 2, text: "x", startMs: 0, endMs: 5000,
      parts: [
        { text: "Yaks live in the high Himalaya,", visualQuery: "yak himalaya" },
        { text: "above the forests and jungles.", visualQuery: "himalayan forest" },
      ],
    }],
    words,
  );
  assert.equal(shots.length, 2);
  assert.equal(shots[0]!.visualQuery, "yak himalaya");
  assert.equal(shots[1]!.visualQuery, "himalayan forest");
  assert.equal(shots[1]!.startMs, 2500); // between "Himalaya," (ends 2400) and "above" (starts 2600)
});

test("parts: a part shorter than 1.5 s joins the one before (no flicker)", () => {
  const words = [word("Big", 0, 1000), word("yaks", 1100, 2400), word("eat", 2500, 2800), word("grass.", 2900, 3300)];
  const shots = planShots(
    [{ order: 1, text: "x", startMs: 0, endMs: 3400, parts: [
      { text: "Big yaks", visualQuery: "yak" },
      { text: "eat grass.", visualQuery: "grass" },
    ] }],
    words,
  );
  assert.equal(shots.length, 1);
  assert.equal(shots[0]!.visualQuery, "yak");
});
