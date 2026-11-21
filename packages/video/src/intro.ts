/**
 * The intro at the start of every video: its text, length and sound.
 *
 * The sound is made by this code (a "whoosh", a deep "hit" and a two-note chime),
 * so we own it: no licence, no credit needed, safe for monetised videos.
 *
 * Settings (environment variables, all optional):
 *   INTRO_SECONDS      how long the intro is (default 2). 0 = no intro.
 *   INTRO_TEXT_NE      big text in Nepali videos  (default: the brand name, "नमस्ते फ्याक्ट्स")
 *   INTRO_TEXT_EN      big text in English videos (default: the brand name, "Namaste Facts")
 *   INTRO_TAGLINE_NE   small line under it in Nepali videos (default: "सानो तथ्य, ठूलो अचम्म")
 *   INTRO_TAGLINE_EN   small line under it in English videos (default: "Small facts, big wonder")
 * The brand itself comes from BRAND_NAME_* / BRAND_TAGLINE_* (see @dualflow/shared brand.ts).
 *   INTRO_SOUND        "on" (default), "off", or the path of your own .wav/.mp3 file
 */
import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandFor } from "@dualflow/shared";
import type { IntroProps } from "./types";

const RATE = 44100;

/** Make the intro sound as a WAV file (mono, 16-bit). `seconds` is the intro length. */
export function introSoundWav(seconds = 2): Buffer {
  const n = Math.round(RATE * Math.max(0.6, seconds));
  const out = new Float32Array(n);
  const hit = 13 / 30; // seconds: the moment the name lands on screen (frame 13)

  // 1. Whoosh: noise that gets brighter and louder until the hit, then fades.
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff; // fixed "random" numbers: same sound every time
    return seed / 0x3fffffff - 1;
  };
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const rise = Math.min(1, t / hit);
    const env = t < hit ? rise * rise : Math.exp(-(t - hit) * 9);
    const cutoff = 0.02 + 0.25 * (t < hit ? rise : Math.exp(-(t - hit) * 6)); // simple low-pass filter
    low += cutoff * (noise() - low);
    out[i]! += low * env * 0.9;
  }

  // 2. Hit: a deep "boom" whose pitch drops quickly (like a kick drum).
  let phase = 0;
  for (let i = Math.round(hit * RATE); i < n; i++) {
    const t = i / RATE - hit;
    const freq = 45 + 90 * Math.exp(-t * 18);
    phase += (2 * Math.PI * freq) / RATE;
    out[i]! += Math.sin(phase) * Math.exp(-t * 6) * 0.8;
  }

  // 3. Chime: two bright notes (E5 then B5) with soft overtones, ringing out.
  const bell = (startSec: number, freq: number, gain: number) => {
    for (let i = Math.round(startSec * RATE); i < n; i++) {
      const t = i / RATE - startSec;
      const attack = Math.min(1, t / 0.005);
      const ring =
        Math.sin(2 * Math.PI * freq * t) +
        0.45 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 3) +
        0.2 * Math.sin(2 * Math.PI * freq * 3.01 * t) * Math.exp(-t * 5);
      out[i]! += ring * attack * Math.exp(-t * 2.6) * gain;
    }
  };
  bell(hit, 659.25, 0.3);
  bell(hit + 0.16, 987.77, 0.26);

  // Make it loud enough but never distorted (peak at about -3 dB), and fade the very end.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.7 / peak : 0;
  const fadeFrom = n - Math.round(0.25 * RATE);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const fade = i > fadeFrom ? (n - i) / (n - fadeFrom) : 1;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i]! * gain * fade)) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Read the intro settings for one language. Returns null when the intro is switched off. */
export function introSettings(language: "ne" | "en", env: NodeJS.ProcessEnv = process.env) {
  const seconds = env.INTRO_SECONDS === undefined || env.INTRO_SECONDS === "" ? 2 : Number(env.INTRO_SECONDS);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const up = language.toUpperCase();
  const brand = brandFor(language, env);
  const text = (env[`INTRO_TEXT_${up}`] || brand.name).trim();
  const tagline = (env[`INTRO_TAGLINE_${up}`] || brand.tagline).trim() || undefined;
  const sound = (env.INTRO_SOUND || "on").trim();
  return { seconds: Math.min(seconds, 5), text, tagline, sound };
}

/**
 * Get the intro ready for one video: writes the sound into the job folder and
 * returns what the video needs (or null when the intro is off).
 */
export async function prepareIntro(
  language: "ne" | "en",
  job: { dir: string; url: (name: string) => string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<IntroProps | null> {
  const s = introSettings(language, env);
  if (!s) return null;
  let soundFile: string | null = null;
  if (/^(off|no|false|0)$/i.test(s.sound)) {
    soundFile = null;
  } else if (/\.(wav|mp3)$/i.test(s.sound)) {
    const name = `intro${path.extname(s.sound).toLowerCase()}`;
    await copyFile(s.sound, path.join(job.dir, name)); // your own sound file
    soundFile = job.url(name);
  } else {
    await writeFile(path.join(job.dir, "intro.wav"), introSoundWav(s.seconds));
    soundFile = job.url("intro.wav");
  }
  return { text: s.text, tagline: s.tagline, durationMs: Math.round(s.seconds * 1000), soundFile };
}
