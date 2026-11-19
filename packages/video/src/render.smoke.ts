/**
 * Quick check that rendering works: makes a 6-second Nepali test video and a thumbnail.
 * Run: pnpm --filter @dualflow/video exec tsx src/render.smoke.ts <output folder>
 */
import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeJobFolder, renderThumbnail, renderVideo } from "./render";

const out = process.argv[2] ?? ".";

/** A quiet tone as a stand-in voice (24 kHz, 16-bit, mono WAV). */
function toneWav(seconds: number): Buffer {
  const rate = 24000;
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 2000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const job = await makeJobFolder();
await writeFile(path.join(job.dir, "voice.wav"), toneWav(6));
const started = Date.now();
await renderVideo(
  {
    format: "SHORT",
    language: "ne",
    title: "सगरमाथाका तीन अचम्मका कुरा",
    audioFile: job.url("voice.wav"),
    durationMs: 6000,
    brand: "DualFlow",
    accent: "#FFC83D",
    scenes: [
      { startMs: 0, endMs: 2000, text: "नमस्ते" },
      { startMs: 2000, endMs: 4000, text: "क्षेत्र" },
      { startMs: 4000, endMs: 6000, text: "फलो" },
    ],
    cues: [
      { startMs: 3200, endMs: 4400, text: "सगरमाथा क्षेत्रको उचाइ ८,८४९ मिटर छ।" },
      { startMs: 4500, endMs: 6000, text: "लाइक र फलो गर्नुहोस्।" },
    ],
  },
  path.join(out, "test-video.mp4"),
  (p) => console.log(`render ${Math.round(p * 100)}%`),
);
console.log(`video took ${((Date.now() - started) / 1000).toFixed(1)} s`);
await renderThumbnail(
  { format: "LONG", language: "ne", headline: "सगरमाथाका ३ रहस्य", brand: "DualFlow", accent: "#FFC83D" },
  path.join(out, "test-thumbnail.jpg"),
);
await job.remove();
console.log("done");
process.exit(0);
