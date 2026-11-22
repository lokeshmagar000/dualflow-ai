/**
 * Tests for the stock clip finder, with a fake fetch (no key, no internet).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findMedia, rankCandidates, stockProvider, tagMatch } from "./stock";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PIXABAY_API_KEY;
  delete process.env.PEXELS_API_KEY;
  delete process.env.STOCK_PROVIDER;
});

const clip = (id: number, width: number, height: number) => ({
  id,
  pageURL: `https://pixabay.com/videos/clip-${id}/`,
  duration: 10,
  videos: { medium: { url: `https://cdn.example/clip-${id}.mp4`, width, height, size: 1 } },
});

test("with no key there are no clips (colour backgrounds)", async () => {
  assert.equal(stockProvider(), null);
  assert.equal(await findMedia("everest", "SHORT", tmpdir(), "s1", new Set()), null);
});

test("Pixabay: picks a tall clip for a Short, downloads it, and skips used ones", async () => {
  process.env.PIXABAY_API_KEY = "test-key";
  assert.equal(stockProvider(), "pixabay");
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    if (url.includes("/api/videos/")) {
      return new Response(JSON.stringify({ hits: [clip(1, 1920, 1080), clip(2, 1080, 1920), clip(3, 720, 1280)] }));
    }
    return new Response(`video bytes of ${url}`);
  }) as typeof fetch;

  const dir = mkdtempSync(path.join(tmpdir(), "stock-"));
  const used = new Set<number>();
  const first = await findMedia("mount everest", "SHORT", dir, "scene-1", used);
  assert.equal(first?.provider, "pixabay");
  assert.equal(first?.id, 2); // tall clip wins over the wide one
  assert.equal(first?.kind, "video");
  assert.match(readFileSync(path.join(dir, "scene-1.mp4"), "utf8"), /clip-2/);

  const second = await findMedia("mount everest", "SHORT", dir, "scene-2", used);
  assert.equal(second?.id, 3); // clip 2 is already used
});

test("Pixabay errors fall back to a colour background, without showing the key", async () => {
  process.env.PIXABAY_API_KEY = "secret-key";
  globalThis.fetch = (async () => new Response("rate limit", { status: 429 })) as typeof fetch;
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (m: string) => warnings.push(m);
  try {
    assert.equal(await findMedia("everest", "LONG", tmpdir(), "s1", new Set()), null);
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.length === 1 && !warnings[0]!.includes("secret-key"));
});

test("tags decide: a clip that shows the scene's thing beats the first result", async () => {
  process.env.PIXABAY_API_KEY = "test-key";
  const tagged = (id: number, tags: string) => ({ ...clip(id, 1080, 1920), tags });
  globalThis.fetch = (async (url: string) => {
    if (url.includes("/api/videos/")) {
      return new Response(JSON.stringify({ hits: [tagged(1, "city, traffic, night"), tagged(2, "yaks, animal, snow, himalaya")] }));
    }
    return new Response(`video bytes of ${url}`);
  }) as typeof fetch;
  const dir = mkdtempSync(path.join(tmpdir(), "stock-"));
  const found = await findMedia(["yak walking snow", "yak"], "SHORT", dir, "shot-1", new Set());
  assert.equal(found?.id, 2);
});

test("tagMatch counts the scene words found in the tags (plurals too)", () => {
  assert.equal(tagMatch("climbers on ice ridge", "climber, ice, mountain"), 2 / 3);
  assert.equal(tagMatch("yak", "city, car"), 0);
});

test("rankCandidates prefers clips long enough for the scene", () => {
  const base = { kind: "video" as const, tags: "tea garden", rightShape: true, downloadUrl: "", sourceUrl: "" };
  const ranked = rankCandidates("tea garden", [
    { ...base, id: 1, duration: 5 },
    { ...base, id: 2, duration: 15 },
  ], 9);
  assert.equal(ranked[0]!.id, 2);
});
