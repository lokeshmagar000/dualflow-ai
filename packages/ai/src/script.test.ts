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
    { order: 1, text: "A", parts: [] },
    { order: 3, text: "C", parts: [] },
  ]);
});

test("parts: the spoken text is the parts joined, each part keeps its own picture", () => {
  const [scene] = alignScenes(
    [
      {
        order: 1,
        text: "ignored when parts are good",
        parts: [
          { text: "Yaks live in the high Himalaya,", visualQuery: "yak himalaya" },
          { text: "above the forests and jungles.", visualQuery: "himalayan forest" },
        ],
      },
    ],
    1,
  );
  assert.equal(scene!.text, "Yaks live in the high Himalaya, above the forests and jungles.");
  assert.deepEqual(scene!.parts.map((p) => p.visualQuery), ["yak himalaya", "himalayan forest"]);
});

test("parts with a missing picture are dropped and the plain text is used", () => {
  const [scene] = alignScenes(
    [{ order: 1, text: "Plain line.", parts: [{ text: "Plain", visualQuery: "" }, { text: "line.", visualQuery: "x" }] }],
    1,
  );
  assert.equal(scene!.text, "Plain line.");
  assert.deepEqual(scene!.parts, []);
});
