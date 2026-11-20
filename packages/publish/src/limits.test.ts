import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLimits, facebookAsReel, pickFormat } from "./limits";

const MB = 1024 * 1024;

test("a 45 s vertical clip is a Short and fits everywhere", () => {
  const v = { sizeBytes: 20 * MB, durationSec: 45, width: 1080, height: 1920 };
  assert.equal(pickFormat(v), "SHORT");
  for (const p of ["youtube", "facebook", "instagram", "tiktok"] as const) assert.equal(checkLimits(p, v).ok, true, p);
});

test("a 2 minute vertical clip: Short on YouTube, normal video on Facebook", () => {
  const v = { sizeBytes: 50 * MB, durationSec: 120, width: 1080, height: 1920 };
  assert.equal(pickFormat(v), "SHORT");
  assert.equal(facebookAsReel("SHORT", 120), false);
  assert.equal(checkLimits("facebook", v).ok, true);
});

test("a wide 8 minute video is Long", () => {
  assert.equal(pickFormat({ durationSec: 480, width: 1920, height: 1080 }), "LONG");
});

test("Instagram refuses files over 300 MB and videos over 15 min", () => {
  const big = checkLimits("instagram", { sizeBytes: 400 * MB, durationSec: 60 });
  assert.equal(big.ok, false);
  assert.match(big.problems[0]!, /300 MB/);
  assert.equal(checkLimits("instagram", { sizeBytes: 10 * MB, durationSec: 16 * 60 }).ok, false);
});

test("TikTok refuses videos over 10 min, YouTube accepts them", () => {
  const v = { sizeBytes: 200 * MB, durationSec: 11 * 60, width: 1920, height: 1080 };
  assert.equal(checkLimits("tiktok", v).ok, false);
  assert.equal(checkLimits("youtube", v).ok, true);
});

test("too short (2 s) is refused by Facebook, Instagram and TikTok", () => {
  const v = { sizeBytes: 1 * MB, durationSec: 2 };
  assert.equal(checkLimits("facebook", v).ok, false);
  assert.equal(checkLimits("instagram", v).ok, false);
  assert.equal(checkLimits("tiktok", v).ok, false);
  assert.equal(checkLimits("youtube", v).ok, true);
});
