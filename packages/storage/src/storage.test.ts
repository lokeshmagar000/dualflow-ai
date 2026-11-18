import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileExists, pathForKey, readFile, saveFile } from "./index";

test("saves and reads a file", async () => {
  process.env.STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "dualflow-"));
  await saveFile("stories/s1/ne/voice.srt", "नमस्ते");
  assert.equal((await readFile("stories/s1/ne/voice.srt")).toString("utf8"), "नमस्ते");
  assert.equal(await fileExists("stories/s1/en/voice.srt"), false);
});

test("refuses keys that try to escape the storage folder", () => {
  for (const bad of ["../.env", "stories/../../.env", "/etc/passwd", "a/./../b", ""]) {
    assert.throws(() => pathForKey(bad), /Unsafe/);
  }
});
