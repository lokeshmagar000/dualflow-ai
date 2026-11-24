import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfLocalDay, videosDueNow } from "./backup-timer";

test("Nepal midnight", () => {
  assert.equal(startOfLocalDay("Asia/Kathmandu", new Date("2026-11-23T20:30:00Z")).toISOString(), "2026-11-23T18:15:00.000Z");
});

test("videos due by Nepal time", () => {
  const tz = "Asia/Kathmandu";
  assert.equal(videosDueNow(tz, 2, new Date("2026-11-23T20:40:00Z")), 0); // 2:25 AM
  assert.equal(videosDueNow(tz, 2, new Date("2026-11-23T20:45:00Z")), 1); // 2:30 AM
  assert.equal(videosDueNow(tz, 2, new Date("2026-11-23T22:44:00Z")), 1); // 4:29 AM
  assert.equal(videosDueNow(tz, 2, new Date("2026-11-24T02:32:00Z")), 2); // 8:17 AM
  assert.equal(videosDueNow(tz, 1, new Date("2026-11-24T02:32:00Z")), 1); // only 1 a day
  assert.equal(videosDueNow(tz, 0, new Date("2026-11-24T02:32:00Z")), 0); // automatic videos off
  assert.equal(videosDueNow(tz, 2, new Date("2026-11-24T17:00:00Z")), 2); // 10:45 PM same day
  assert.equal(videosDueNow(tz, 2, new Date("2026-11-24T18:20:00Z")), 0); // 12:05 AM next day
});
