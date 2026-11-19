/**
 * Test the Edge TTS provider without internet: a tiny fake "python"
 * makes a real MP3 with FFmpeg (a 1-second tone) and prints word times,
 * just like python/edge_speak.py does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { edgeVoice } from "./edge";
import { pcmDurationMs } from "./wav";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("Edge provider turns the MP3 into PCM and keeps the word times", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fake-python-"));
  const fake = path.join(dir, "python");
  // Arguments: $1 = script path (ignored), $2 = where to save the MP3.
  writeFileSync(
    fake,
    `#!/bin/sh
cat > /dev/null
ffmpeg -v error -y -f lavfi -i sine=frequency=440:duration=1 -ar 24000 -ac 1 "$2"
printf '%s' '{"words":[{"text":"नमस्ते","startMs":100,"endMs":600},{"text":" ","startMs":600,"endMs":600}]}'
`,
  );
  chmodSync(fake, 0o755);
  process.env.EDGE_TTS_PYTHON = fake;

  const voice = edgeVoice();
  assert.equal(voice.voiceFor("ne"), "ne-NP-HemkalaNeural");
  assert.equal(voice.costUsd(10_000), 0);
  const result = await voice.speak("नमस्ते", "ne");
  assert.deepEqual(result.words, [{ text: "नमस्ते", startMs: 100, endMs: 600 }]); // empty word dropped
  const ms = pcmDurationMs(result.pcm);
  assert.ok(ms > 900 && ms < 1200, `audio should be about 1 second, got ${ms} ms`);
});

test("a missing Python program is a setup error, not something to retry", async () => {
  process.env.EDGE_TTS_PYTHON = "/no/such/python";
  await assert.rejects(edgeVoice().speak("hello", "en"), /not installed/);
});
