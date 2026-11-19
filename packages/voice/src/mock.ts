/**
 * PRACTICE VOICE (VOICE_PROVIDER=mock)
 *
 * Makes a "fake voice": a soft beep at the start of every word, then quiet.
 * It costs nothing and needs no key, but the timings behave like a real voice,
 * so subtitles, scene times and the player can all be tested.
 */
import type { Language } from "@dualflow/shared";
import type { SpeechResult, VoiceProvider, WordTiming } from "./types";
import { SAMPLE_RATE, BYTES_PER_SAMPLE } from "./wav";

/**
 * Count "letters as people see them" (graphemes). In Devanagari, "क्षि" is
 * several Unicode code points but one visible letter group, so .length would lie.
 */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function visibleLength(word: string): number {
  return [...graphemes.segment(word)].length;
}

/** Rough speaking speed: a fixed part plus a bit for every visible letter. */
function wordMs(word: string, language: Language): number {
  const perLetter = language === "ne" ? 85 : 65; // Nepali letters carry more sound each
  return 120 + visibleLength(word) * perLetter;
}

const GAP_MS = 60; // tiny pause between words
const SENTENCE_PAUSE_MS = 250; // longer pause after . ! ? ।

export function estimateWords(text: string, language: Language): WordTiming[] {
  const words: WordTiming[] = [];
  let t = 0;
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const len = wordMs(word, language);
    words.push({ text: word, startMs: t, endMs: t + len });
    t += len + GAP_MS + (/[.!?।]$/.test(word) ? SENTENCE_PAUSE_MS : 0);
  }
  return words;
}

/** Write a short, quiet 440 Hz beep into the PCM buffer at a given time. */
function beep(pcm: Buffer, atMs: number) {
  const start = Math.floor((atMs / 1000) * SAMPLE_RATE);
  const length = Math.floor(0.04 * SAMPLE_RATE); // 40 ms
  for (let i = 0; i < length; i++) {
    const offset = (start + i) * BYTES_PER_SAMPLE;
    if (offset + 2 > pcm.length) break;
    const fade = 1 - i / length; // fade out so it does not click
    const value = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 3000 * fade;
    pcm.writeInt16LE(Math.round(value), offset);
  }
}

export const mockVoice: VoiceProvider = {
  name: "mock",
  voiceFor: (language) => `practice-${language}`,
  costUsd: () => 0,
  async speak(text, language): Promise<SpeechResult> {
    const words = estimateWords(text, language);
    const durationMs = (words.at(-1)?.endMs ?? 0) + 200;
    const samples = Math.ceil((durationMs / 1000) * SAMPLE_RATE);
    const pcm = Buffer.alloc(samples * BYTES_PER_SAMPLE);
    for (const w of words) beep(pcm, w.startMs);
    return { pcm, words, durationMs };
  },
};
