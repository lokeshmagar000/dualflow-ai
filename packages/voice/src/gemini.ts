/**
 * FREE VOICE: Gemini TTS (VOICE_PROVIDER=gemini).
 *
 * Google's Gemini voices, with the SAME free key as the rest of the app
 * (GEMINI_API_KEY from Google AI Studio). Tested in Nepali on 2026-11-19:
 * the voices Kore, Aoede, Charon and Puck all work.
 *
 * The free tier allows only about 15 voice requests a day, so we save requests:
 * all scenes of a video go in ONE request, and we cut the audio back into
 * scenes at the pauses between them (see splitAtPauses).
 *
 * Gemini does not say when each word is spoken, so subtitles use estimated
 * word times, stretched to fit the real length of each scene.
 *
 * Settings (all optional):
 *   GEMINI_VOICE_NE / GEMINI_VOICE_EN   voice name, or several separated by commas
 *                                       (default "Aoede,Charon": a woman and a man).
 *                                       With several, each story gets one of them, so
 *                                       videos are sometimes female, sometimes male.
 *   GEMINI_TTS_MODEL                    model (default gemini-3.1-flash-tts-preview)
 *   GEMINI_TTS_STYLE                    how to speak, e.g. "calm, like a news reader"
 */
import type { Language } from "@dualflow/shared";
import type { SpeechResult, VoiceProvider, WordTiming } from "./types";
import { VoiceConfigError } from "./azure";
import { estimateWords } from "./mock";
import { BYTES_PER_SAMPLE, pcmDurationMs, SAMPLE_RATE } from "./wav";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const LANGUAGE_NAME: Record<Language, string> = { ne: "Nepali", en: "English" };
/** Longest text we send in one request; longer videos are split into a few requests. */
const MAX_CHARS = Number(process.env.GEMINI_TTS_MAX_CHARS ?? 1500);

/** The free daily voice limit is used up (or Google says "too many"). */
export class VoiceQuotaError extends Error {}

/** Many voices at once: one audio piece (and word times) per scene. */
export interface ManyResult {
  pieces: SpeechResult[];
  /** How many requests we sent (each one counts toward the free daily limit). */
  requests: number;
}

/** Ask Gemini to read `text` aloud. Returns raw 24 kHz 16-bit mono PCM. */
async function requestAudio(text: string, language: Language, voice: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new VoiceConfigError("VOICE_PROVIDER=gemini needs GEMINI_API_KEY (free from Google AI Studio).");
  const style =
    process.env.GEMINI_TTS_STYLE ||
    (process.env.VIDEO_STYLE?.toLowerCase() === "classic"
      ? `Read this aloud in natural, warm ${LANGUAGE_NAME[language]}, like a friendly YouTube storyteller. Pause clearly (about half a second) at every blank line. Read only the text`
      : // Style V2: livelier, a little faster, with stress on the key words.
        `Read this aloud in natural ${LANGUAGE_NAME[language]}, like an energetic, curious YouTube Shorts storyteller sharing a surprising secret: lively and a little fast, with clear stress on the key words. Pause clearly (about half a second) at every blank line. Read only the text`);
  const models = process.env.GEMINI_TTS_MODEL ? [process.env.GEMINI_TTS_MODEL] : DEFAULT_MODELS;

  let last = "";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        // The key goes in a header, never in the URL, so it never shows in logs.
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${style}:\n${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      last = `${model}: ${(err as Error).message}`;
      continue; // no answer in time: try the next model
    }
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
      };
      const audio = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (audio) return Buffer.from(audio, "base64");
      last = `${model}: the answer had no audio`;
      continue;
    }
    const details = (await res.text()).slice(0, 300);
    last = `${model}: HTTP ${res.status} ${details}`;
    if (res.status === 429) continue; // this model's free limit is used up: try the next one
    if (res.status === 404) continue; // model name not available (yet): try the next one
    if ([400, 401, 403].includes(res.status)) throw new VoiceConfigError(`Gemini voice error: ${last}`);
    // 500/503: busy, try the next model
  }
  if (/HTTP 429/.test(last)) throw new VoiceQuotaError(`Gemini free voice limit reached (${last}).`);
  throw new Error(`Gemini voice failed (will retry): ${last}`);
}

/** Estimated word times for `text`, stretched to fit `durationMs` exactly. */
export function fitWords(text: string, language: Language, durationMs: number): WordTiming[] {
  const words = estimateWords(text, language);
  const estimated = words.at(-1)?.endMs ?? 0;
  if (estimated === 0) return words;
  // Leave a little quiet time at the start and end of the piece.
  const lead = Math.min(150, durationMs * 0.05);
  const scale = Math.max(0, durationMs - 2 * lead) / estimated;
  return words.map((w) => ({
    text: w.text,
    startMs: Math.round(lead + w.startMs * scale),
    endMs: Math.round(lead + w.endMs * scale),
  }));
}

/** Loudness of each 20 ms slice of the audio. */
function loudness(pcm: Buffer, frameMs = 20): number[] {
  const frame = Math.round((SAMPLE_RATE * frameMs) / 1000) * BYTES_PER_SAMPLE;
  const out: number[] = [];
  for (let start = 0; start + BYTES_PER_SAMPLE <= pcm.length; start += frame) {
    const end = Math.min(start + frame, pcm.length - (pcm.length % 2));
    let sum = 0;
    let n = 0;
    for (let i = start; i + 1 < end; i += 2) {
      const v = pcm.readInt16LE(i);
      sum += v * v;
      n++;
    }
    out.push(n ? Math.sqrt(sum / n) : 0);
  }
  return out;
}

/**
 * Cut one long recording into pieces at the pauses between scenes.
 * This decides when each picture appears, so it must be right.
 *
 * `weights` = how long each scene should take to say (estimated speaking time,
 * or just the text length). From the weights we know roughly WHERE each cut
 * should be. Then we look at every pause in the audio and choose the best set
 * of pauses, in order, with "dynamic programming" (try every sensible
 * combination, keep the best score): long pauses close to the expected place win.
 * A short comma pause in the right place loses to the long scene pause nearby.
 */
export function splitAtPauses(pcm: Buffer, weights: number[]): Buffer[] {
  if (weights.length <= 1) return [pcm];
  const FRAME_MS = 20;
  const levels = loudness(pcm, FRAME_MS);
  const frames = levels.length;
  const cutsNeeded = weights.length - 1;

  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const expected: number[] = [];
  let done = 0;
  for (let i = 0; i < cutsNeeded; i++) {
    done += weights[i]!;
    expected.push((done / total) * frames);
  }

  // Quiet stretches (pauses). If the voice ran sentences together, accept shorter ones.
  let pauses = findPauses(levels, 5);
  if (pauses.length < cutsNeeded) pauses = findPauses(levels, 3);

  const frameBytes = Math.round((SAMPLE_RATE * FRAME_MS) / 1000) * BYTES_PER_SAMPLE;
  const cuts = pauses.length >= cutsNeeded ? choosePauses(pauses, expected, frames / weights.length) : expected;
  const bounds = [0, ...cuts.map((c) => Math.min(pcm.length, Math.round(c) * frameBytes)), pcm.length];
  for (let i = 1; i < bounds.length; i++) bounds[i] = Math.max(bounds[i]!, bounds[i - 1]!); // never go backwards
  return weights.map((_, i) => pcm.subarray(bounds[i]!, bounds[i + 1]!));
}

type Pause = { center: number; length: number };

/** All quiet stretches of at least `minFrames` frames (1 frame = 20 ms). */
function findPauses(levels: number[], minFrames: number): Pause[] {
  const sorted = [...levels].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const quiet = Math.max(200, loud * 0.06);
  const pauses: Pause[] = [];
  let runStart = -1;
  levels.forEach((level, i) => {
    const silent = level < quiet;
    if (silent && runStart < 0) runStart = i;
    if ((!silent || i === levels.length - 1) && runStart >= 0) {
      const runEnd = silent ? i + 1 : i;
      // Silence at the very start or end of the audio is not a pause between scenes.
      if (runEnd - runStart >= minFrames && runStart > 0 && runEnd < levels.length) {
        pauses.push({ center: (runStart + runEnd) / 2, length: runEnd - runStart });
      }
      runStart = -1;
    }
  });
  return pauses;
}

/**
 * Choose one pause per cut, in time order, with the best total score.
 * score = pause length (long = probably between scenes) minus distance from
 * the expected place (measured in "average scene lengths").
 */
function choosePauses(pauses: Pause[], expected: number[], sceneFrames: number): number[] {
  const K = expected.length;
  const P = pauses.length;
  const score = (k: number, j: number) => {
    const p = pauses[j]!;
    const distance = Math.abs(p.center - expected[k]!) / Math.max(1, sceneFrames);
    return Math.min(p.length, 50) / 10 - 4 * distance;
  };
  // best[k][j] = best total score when cut k uses pause j.
  const best: number[][] = Array.from({ length: K }, () => new Array<number>(P).fill(-Infinity));
  const from: number[][] = Array.from({ length: K }, () => new Array<number>(P).fill(-1));
  for (let j = 0; j < P; j++) best[0]![j] = score(0, j);
  for (let k = 1; k < K; k++) {
    let runBest = -Infinity;
    let runIdx = -1;
    for (let j = k; j < P; j++) {
      // the previous cut must use an earlier pause
      if (best[k - 1]![j - 1]! > runBest) {
        runBest = best[k - 1]![j - 1]!;
        runIdx = j - 1;
      }
      if (runIdx >= 0) {
        best[k]![j] = runBest + score(k, j);
        from[k]![j] = runIdx;
      }
    }
  }
  let j = -1;
  let top = -Infinity;
  for (let i = 0; i < P; i++) {
    if (best[K - 1]![i]! > top) {
      top = best[K - 1]![i]!;
      j = i;
    }
  }
  const cuts = new Array<number>(K);
  for (let k = K - 1; k >= 0; k--) {
    cuts[k] = pauses[j]!.center;
    j = from[k]![j]!;
  }
  return cuts;
}

/**
 * Remove quiet audio at the start and end of a piece, keeping `keepMs` of it
 * so words are never clipped.
 */
export function trimSilence(pcm: Buffer, keepMs = 120): Buffer {
  const FRAME_MS = 20;
  const levels = loudness(pcm, FRAME_MS);
  if (levels.length === 0) return pcm;
  const sorted = [...levels].sort((a, b) => a - b);
  const quiet = Math.max(200, (sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 0.06);
  const first = levels.findIndex((l) => l >= quiet);
  if (first < 0) return pcm; // all quiet: leave it alone
  let last = levels.length - 1;
  while (last > first && levels[last]! < quiet) last--;
  const keep = Math.round(keepMs / FRAME_MS);
  const frameBytes = Math.round((SAMPLE_RATE * FRAME_MS) / 1000) * BYTES_PER_SAMPLE;
  const start = Math.max(0, first - keep) * frameBytes;
  const end = Math.min(pcm.length, (last + 1 + keep) * frameBytes);
  return pcm.subarray(start, end);
}

/** Roughly how long `text` takes to say (used to guess where each scene ends). */
export function speakingWeight(text: string, language: Language): number {
  return Math.max(1, estimateWords(text, language).at(-1)?.endMs ?? text.length);
}

/** Put scenes into groups that each fit in one request. */
function batches(texts: string[]): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let size = 0;
  texts.forEach((t, i) => {
    if (current.length > 0 && size + t.length > MAX_CHARS) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += t.length;
  });
  if (current.length) groups.push(current);
  return groups;
}

/** The owner's chosen voices (2026-11-19): Aoede (woman, light) and Charon (man, calm). */
const DEFAULT_VOICES = "Aoede,Charon";

/**
 * Pick one voice from a list. `seed` "#N" (the video's number) takes the voices in
 * turn, so each video sounds different from the one before. Any other seed (a story
 * id) always gives the same voice for the same story, so a retry does not change it.
 */
export function pickVoice(list: string, seed?: string): string {
  const voices = list.split(",").map((v) => v.trim()).filter(Boolean);
  if (voices.length === 0) return "Kore";
  if (!seed) return voices[0]!;
  // "#7" = the 7th video: take the voices in turn, so the voice changes on every video.
  const turn = /^#(\d+)$/.exec(seed);
  if (turn) return voices[Number(turn[1]) % voices.length]!;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return voices[hash % voices.length]!;
}

/** `seed` = the story id, used to choose between several voices. */
export function geminiVoice(
  seed?: string,
): VoiceProvider & { speakMany(texts: string[], language: Language): Promise<ManyResult> } {
  const voiceFor = (language: Language) =>
    pickVoice((language === "ne" ? process.env.GEMINI_VOICE_NE : process.env.GEMINI_VOICE_EN) || DEFAULT_VOICES, seed);

  return {
    name: "gemini",
    voiceFor,
    costUsd: () => 0, // free tier

    async speak(text: string, language: Language): Promise<SpeechResult> {
      const pcm = await requestAudio(text, language, voiceFor(language));
      const durationMs = pcmDurationMs(pcm);
      return { pcm, words: fitWords(text, language, durationMs), durationMs };
    },

    /** Read many scenes with as few requests as possible. */
    async speakMany(texts: string[], language: Language): Promise<ManyResult> {
      const pieces: SpeechResult[] = new Array(texts.length);
      const groups = batches(texts);
      for (const group of groups) {
        // A blank line between scenes makes the voice pause there, so we can cut.
        const joined = group.map((i) => texts[i]!.trim()).join("\n\n");
        const pcm = await requestAudio(joined, language, voiceFor(language));
        const parts = splitAtPauses(
          pcm,
          group.map((i) => speakingWeight(texts[i]!, language)),
        );
        group.forEach((sceneIndex, k) => {
          // Cut away the long quiet bits at both ends: the voiceover adds the same short
          // gap between every scene, so the pacing is even and each picture
          // appears right when its words start.
          const part = trimSilence(parts[k]!);
          const durationMs = pcmDurationMs(part);
          pieces[sceneIndex] = { pcm: part, words: fitWords(texts[sceneIndex]!, language, durationMs), durationMs };
        });
      }
      return { pieces, requests: groups.length };
    },
  };
}
