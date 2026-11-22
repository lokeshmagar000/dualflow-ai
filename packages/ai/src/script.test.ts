/**
 * Tests for cleaning the script and matching each line to its picture (no AI needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { alignScenes, cleanLine } from "./script";

test("cleanLine removes things the voice should never read aloud", () => {
  assert.equal(cleanLine("Scene 2: **Everest** grows every year! 🏔️ #Everest"), "Everest grows every year!");
  assert.equal(cleanLine("Narrator: [upbeat music] It is tall ."), "It is tall.");
  assert.equal(cleanLine("दृश्य ३: सगरमाथा   अग्लो छ ।"), "सगरमाथा अग्लो छ।");
  assert.equal(cleanLine("It is 8,849 metres (29,032 feet) tall."), "It is 8,849 metres (29,032 feet) tall.");
});

test("alignScenes keeps each line next to its own picture", () => {
  // The AI skipped scene 2 but numbered the others correctly.
  const out = alignScenes(
    [
      { order: 1, text: "Hook" },
      { order: 3, text: "Third" },
      { order: 4, text: "Follow" },
    ],
    4,
  );
  assert.deepEqual(out.map((s) => s.order), [1, 3, 4]);
});

test("alignScenes falls back to position when numbers are broken, and drops extras and empties", () => {
  const out = alignScenes(
    [
      { order: 0, text: "A" },
      { order: 0, text: "  " },
      { order: 0, text: "C" },
      { order: 0, text: "Extra" },
    ],
    3,
  );
  assert.deepEqual(out, [
    { order: 1, text: "A" },
    { order: 3, text: "C" },
  ]);
});
