/**
 * Tests for the "is this Nepali script really in Nepali?" check (no AI needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { devanagariShare, looksNepali } from "./script";

test("a Nepali script passes, even with an English brand name", () => {
  const scenes = [
    { order: 1, text: "केराको बोट रूख होइन, यो ठूलो घाँस हो।", parts: [] },
    { order: 2, text: "YouTube मा हेर्नुहोस्।", parts: [] },
  ];
  assert.equal(looksNepali({ scenes }), true);
});

test("a 'Nepali' script written in English fails", () => {
  assert.equal(looksNepali({ scenes: [{ order: 1, text: "Banana plants are actually giant herbs, not trees.", parts: [] }] }), false);
});

test("only letters count", () => {
  assert.equal(devanagariShare("१२३ !!"), 0);
});
