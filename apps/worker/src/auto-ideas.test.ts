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
