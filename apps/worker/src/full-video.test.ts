import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLanguages, parseSources } from "./full-video";
import { chaptersFor, fullVideoExtras, hookFromTitle } from "./steps/full";

test("full video: news sources from the form box (url | paper | headline | date), bad lines skipped", () => {
  const s = parseSources("https://a.com/x | The Tribune | 19 outcomes | 2026-11-24 ;; not a link ;; https://www.b.org/y");
  assert.deepEqual(s, [
    { url: "https://a.com/x", publisher: "The Tribune", title: "19 outcomes", publishedAt: "2026-11-24" },
    { url: "https://www.b.org/y", publisher: "b.org", title: "b.org" },
  ]);
});

test("full video: languages", () => {
  assert.deepEqual(parseLanguages("ne"), ["ne"]);
  assert.deepEqual(parseLanguages("ne, en"), ["ne", "en"]);
  assert.deepEqual(parseLanguages("xx"), ["ne", "en"]);
});

test("full video: chapter titles in the video's language; a Nepali video never shows an English title", () => {
  const research = { chapters: [{ title: "What happened", firstScene: 3, lastScene: 9 }, { title: "Next", firstScene: 10, lastScene: 16 }] };
  assert.deepEqual(chaptersFor(research, { chapterTitles: ["के भयो"] }, "ne").map((c) => c.title), ["के भयो", ""]);
  assert.deepEqual(chaptersFor(research, null, "en").map((c) => c.title), ["What happened", "Next"]);
  const extras = fullVideoExtras(research, { chapterTitles: ["के भयो"] }, [{ order: 1, startMs: 0, endMs: 5000 }, { order: 2, startMs: 50_000, endMs: 55_000 }], "ne", 100_000);
  assert.equal(extras.wide, true);
  assert.deepEqual(extras.chapters, [{ order: 3, title: "के भयो" }]);
  assert.equal(extras.follow?.atMs, 50_000);
});

test("full video: a short's hook from its chapter title", () => {
  assert.deepEqual(hookFromTitle("What was signed"), ["What was signed"]);
  assert.deepEqual(hookFromTitle("Why it matters for Nepal"), ["Why it matters", "for Nepal"]);
});
