/**
 * Turn word timings into subtitles.
 *
 * A "cue" is one subtitle line on screen: some text plus when it appears and
 * disappears. We group words into cues that are short enough to read
 * (max ~42 visible letters, max 2 lines on a phone) and we start a new cue
 * after the end of a sentence, so a cue never mixes two sentences.
 *
 * Output formats:
 *   SRT  - used by YouTube, Facebook and most video editors.
 *   VTT  - used by web browsers (<track> tags).
 * Both are saved as UTF-8, which is required for Devanagari (Nepali) letters.
 */
import type { WordTiming } from "./types";

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CueOptions {
  /** Most visible letters in one cue. */
  maxChars?: number;
  /** Longest time one cue stays on screen. */
  maxDurationMs?: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const visibleLength = (s: string) => [...graphemes.segment(s)].length;
/** Ends a sentence: English . ! ? and the Nepali danda । */
const SENTENCE_END = /[.!?।]["'”’)]*$/;

export function buildCues(words: WordTiming[], options: CueOptions = {}): Cue[] {
  const maxChars = options.maxChars ?? 42;
  const maxDurationMs = options.maxDurationMs ?? 4500;
  const cues: Cue[] = [];
  let current: WordTiming[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      startMs: current[0]!.startMs,
      endMs: current.at(-1)!.endMs,
      text: current.map((w) => w.text).join(" "),
    });
    current = [];
  };

  for (const word of words) {
    if (current.length > 0) {
      const text = [...current, word].map((w) => w.text).join(" ");
      const tooLong = visibleLength(text) > maxChars;
      const tooSlow = word.endMs - current[0]!.startMs > maxDurationMs;
      if (tooLong || tooSlow) flush();
    }
    current.push(word);
    if (SENTENCE_END.test(word.text)) flush();
  }
  flush();
  return cues;
}

/** 3723004 ms -> "01:02:03,004" (SRT uses a comma, VTT uses a dot). */
export function formatTime(ms: number, separator: "," | "." = ","): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const rest = total % 1000;
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(rest, 3)}`;
}

/**
 * SRT format:
 *   1
 *   00:00:00,000 --> 00:00:02,500
 *   First line of text
 *   (blank line)
 */
export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${formatTime(c.startMs)} --> ${formatTime(c.endMs)}\n${c.text}\n`)
    .join("\n");
}

/** VTT format: like SRT, but starts with "WEBVTT" and uses dots in times. */
export function toVtt(cues: Cue[]): string {
  const body = cues
    .map((c) => `${formatTime(c.startMs, ".")} --> ${formatTime(c.endMs, ".")}\n${c.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
