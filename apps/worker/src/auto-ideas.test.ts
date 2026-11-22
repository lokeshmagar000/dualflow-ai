import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfLocalDay } from "./auto-ideas";

test("Nepal day starts at 18:15 UTC the day before", () => {
  // 2026-11-20 15:41 UTC = 21:26 in Nepal (UTC+5:45) -> Nepal midnight = 2026-11-19 18:15 UTC
  assert.equal(startOfLocalDay("Asia/Kathmandu", new Date("2026-11-20T15:41:05Z")).toISOString(), "2026-11-19T18:15:00.000Z");
  // 2026-11-20 20:00 UTC = 01:45 on 21 Nov in Nepal -> 2026-11-20 18:15 UTC
  assert.equal(startOfLocalDay("Asia/Kathmandu", new Date("2026-11-20T20:00:00Z")).toISOString(), "2026-11-20T18:15:00.000Z");
});

test("UTC day starts at midnight", () => {
  assert.equal(startOfLocalDay("UTC", new Date("2026-11-20T15:41:05.123Z")).toISOString(), "2026-11-20T00:00:00.000Z");
});

test("backup runs add a video only when the main run was skipped", async () => {
  const { roomForRun } = await import("./auto-ideas");
  const base = { force: false, perDay: 2, perRun: 1 };
  assert.equal(roomForRun({ ...base, today: 0, slot: 1 }), 1); // 2 AM run (or 3 AM backup after a skipped 2 AM)
  assert.equal(roomForRun({ ...base, today: 1, slot: 1 }), 0); // 3 AM backup when 2 AM worked
  assert.equal(roomForRun({ ...base, today: 1, slot: 2 }), 1); // 4 AM run
  assert.equal(roomForRun({ ...base, today: 2, slot: 2 }), 0); // 5 AM backup when 4 AM worked
  assert.equal(roomForRun({ ...base, today: 0, slot: 2 }), 1); // both skipped: still one per run
  assert.equal(roomForRun({ ...base, today: 2 }), 0); // "Run now" without slot
  assert.equal(roomForRun({ ...base, today: 5, force: true }), 1); // Generate now
  assert.equal(roomForRun({ ...base, perDay: 0, today: 0, slot: 1 }), 0); // automatic videos off
});
