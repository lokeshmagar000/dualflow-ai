import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSlot, parseTimes, planSlots, zoneOffsetMinutes } from "./schedule";

test("Nepal is 5 hours 45 minutes ahead of UTC", () => {
  assert.equal(zoneOffsetMinutes("Asia/Kathmandu", new Date("2026-11-19T00:00:00Z")), 345);
  assert.equal(zoneOffsetMinutes("UTC", new Date("2026-11-19T00:00:00Z")), 0);
});

test("reads upload times and skips bad ones", () => {
  assert.deepEqual(parseTimes("19:00, 07:30,nonsense,25:00"), [[7, 30], [19, 0]]);
  assert.deepEqual(parseTimes(""), [[7, 0], [12, 30], [19, 0]]);
});

test("finds the next slot in Nepal time", () => {
  // 2026-11-19 08:00 Nepal = 02:15 UTC. Next slot: 12:30 Nepal = 06:45 UTC.
  const now = new Date("2026-11-19T02:15:00Z");
  assert.equal(nextSlot(now).toISOString(), "2026-11-19T06:45:00.000Z");
  // After 19:00 Nepal (13:15 UTC) the next slot is tomorrow 07:00 Nepal (01:15 UTC).
  assert.equal(nextSlot(new Date("2026-11-19T14:00:00Z")).toISOString(), "2026-11-20T01:15:00.000Z");
});

test("a bulk queue spreads videos over the free slots", () => {
  const now = new Date("2026-11-19T02:15:00Z");
  const taken = [new Date("2026-11-19T06:45:00Z")]; // 12:30 today is already used
  const slots = planSlots(3, taken, now).map((d) => d.toISOString());
  assert.deepEqual(slots, ["2026-11-19T13:15:00.000Z", "2026-11-20T01:15:00.000Z", "2026-11-20T06:45:00.000Z"]);
});
