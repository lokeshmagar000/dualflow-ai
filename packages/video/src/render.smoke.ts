/**
 * Quick check that rendering works: makes a short Nepali and English test video
 * (intro + Word Pop subtitles) and a thumbnail.
 * Run: pnpm --filter @dualflow/video exec tsx src/render.smoke.ts <output folder>
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { BRAND_COLORS, brandFor } from "@dualflow/shared";
import { prepareIntro } from "./intro";
import { makeJobFolder, renderThumbnail, renderVideo } from "./render";
import type { VideoWord } from "./types";

const out = process.argv[2] ?? ".";

/** A quiet tone as a stand-in voice (24 kHz, 16-bit, mono WAV). */
function toneWav(seconds: number): Buffer {
  const rate = 24000;
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 1200), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Pretend word times: each word gets time by its length. */
function timed(text: string, startMs: number): VideoWord[] {
  let t = startMs;
  return text.split(" ").map((w) => {
    const len = 180 + [...w].length * 45;
    const word = { text: w, startMs: t, endMs: t + len };
    t += len + 60;
    return word;
  });
}

const SAMPLES = {
  ne: { title: "सगरमाथाका तीन अचम्मका कुरा", text: "नेपालको पर्यटन क्षेत्र यस वर्ष छिटो बढ्दैछ। सगरमाथा संसारकै सबैभन्दा अग्लो हिमाल हो।" },
  en: { title: "3 amazing facts about Everest", text: "Nepal's tourism sector is growing fast this year. Everest is the tallest mountain in the world." },
} as const;

for (const language of ["ne", "en"] as const) {
  const job = await makeJobFolder();
  const words = timed(SAMPLES[language].text, 300);
  const durationMs = words.at(-1)!.endMs + 300;
  await writeFile(path.join(job.dir, "voice.wav"), toneWav(Math.ceil(durationMs / 1000)));
  const started = Date.now();
  await renderVideo(
    {
      format: "SHORT",
      language,
      title: SAMPLES[language].title,
      audioFile: job.url("voice.wav"),
      durationMs,
      brand: brandFor(language).name,
      brandTag: brandFor(language).tag,
      accent: BRAND_COLORS.marigold,
      scenes: [
        { startMs: 0, endMs: durationMs / 2, text: "" },
        { startMs: durationMs / 2, endMs: durationMs, text: "" },
      ],
      cues: [],
      words,
      intro: await prepareIntro(language, job, {}),
    },
    path.join(out, `test-video-${language}.mp4`),
    (p) => console.log(`${language} render ${Math.round(p * 100)}%`),
  );
  console.log(`${language} video took ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await job.remove();
}
// One thumbnail per language and platform size.
const HEADLINES = { ne: "सगरमाथाका ३ रहस्य", en: "Everest grows 4 mm a year" } as const;
for (const language of ["ne", "en"] as const) {
  for (const size of ["shorts", "youtube", "feed"] as const) {
    const b = brandFor(language);
    await renderThumbnail(
      { format: "SHORT", size, language, headline: HEADLINES[language], brand: b.name, brandTag: b.tag, accent: BRAND_COLORS.marigold },
      path.join(out, `test-thumbnail-${language}-${size}.jpg`),
    );
  }
}
console.log("done");
process.exit(0);
