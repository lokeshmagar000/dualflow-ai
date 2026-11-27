import assert from "node:assert/strict";
import { test } from "node:test";
import { pictureSpots } from "./steps/mypictures";

test("my pictures: news lines first, then spread over the other lines, never the hook", () => {
  // 10 lines; lines 3 and 6 are about the news event.
  const news = [false, false, true, false, false, true, false, false, false, false];
  assert.deepEqual([...pictureSpots(news, 1)], [[3, 0]]);
  assert.deepEqual([...pictureSpots(news, 4)], [[3, 0], [6, 1], [2, 2], [7, 3]]);
  assert.equal(pictureSpots(news, 0).size, 0);
  // More pictures than lines: each line gets at most one.
  assert.equal(pictureSpots([false, false, false], 9).size, 2);
});
