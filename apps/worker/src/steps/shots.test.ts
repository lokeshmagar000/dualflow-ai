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
