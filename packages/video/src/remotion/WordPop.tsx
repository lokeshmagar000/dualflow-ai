/**
 * "Word Pop" subtitles (the style the owner picked).
 *
 * Big bold words, up to 3 at a time. The word being spoken turns yellow,
 * pops a little bigger and tilts. English uses Poppins (in CAPITALS),
 * Nepali uses Mukta, a free Google font made for Devanagari, so joined
 * letters like "क्ष" and "र्य" are drawn correctly (Chrome does the shaping).
 */
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoCue, VideoWord } from "../types";

/** Fonts for each language (loaded in Root.tsx, waited for in common.tsx). */
export const WORD_POP_FONT = { en: '"Poppins", sans-serif', ne: '"Mukta", "Noto Sans Devanagari", sans-serif' };

const MAX_WORDS = 3; // words on screen at once
const GAP_BREAK_MS = 450; // a pause this long starts a new group
const LINGER_MS = 450; // keep the last group on screen a little after it is spoken
const SENTENCE_END = /[।॥.!?,;:]$/; // a group never runs past the end of a sentence

type Page = { words: VideoWord[]; startMs: number; endMs: number };

/** Split the words into small groups ("pages"). */
export function buildPages(words: VideoWord[]): Page[] {
  const pages: Page[] = [];
  let current: VideoWord[] = [];
  const close = () => {
    if (current.length) pages.push({ words: current, startMs: current[0]!.startMs, endMs: current.at(-1)!.endMs });
    current = [];
  };
  words.forEach((w, i) => {
    current.push(w);
    const next = words[i + 1];
    if (current.length >= MAX_WORDS || SENTENCE_END.test(w.text) || !next || next.startMs - w.endMs > GAP_BREAK_MS) close();
  });
  return pages;
}

/** When we have no word timings, spread each line's words evenly over its time. */
export function wordsFromCues(cues: VideoCue[]): VideoWord[] {
  return cues.flatMap((c) => {
    const parts = c.text.split(/\s+/).filter(Boolean);
    const each = (c.endMs - c.startMs) / Math.max(1, parts.length);
    return parts.map((text, i) => ({ text, startMs: c.startMs + i * each, endMs: c.startMs + (i + 1) * each }));
  });
}

/**
 * Count letters as you see them: "क्षे" is one letter on screen but 4 code points.
 * (Intl.Segmenter splits text into "grapheme clusters", the pieces a reader sees.)
 */
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
function visibleLetters(text: string) {
  return segmenter ? [...segmenter.segment(text)].length : [...text].length;
}

export function WordPop({
  pages,
  language,
  tall,
}: {
  pages: Page[];
  language: "ne" | "en";
  tall: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080; // sizes below are for a 1080 px short side
  const nowMs = (frame / fps) * 1000;
  const toFrame = (ms: number) => Math.round((ms / 1000) * fps);

  // The group on screen now: from just before its first word until the next group starts.
  const index = pages.findIndex((p, i) => {
    const next = pages[i + 1];
    const until = next ? Math.min(next.startMs - 40, p.endMs + LINGER_MS) : p.endMs + LINGER_MS;
    return nowMs >= p.startMs - 80 && nowMs < until;
  });
  const page = pages[index];
  if (!page) return null;

  // The group pops in when it appears.
  const enter = spring({ frame: frame - toFrame(page.startMs - 80), fps, config: { damping: 12, mass: 0.5 } });

  // Very long groups: make the letters a bit smaller (a group may also wrap to 2 lines).
  const letters = page.words.reduce((n, w) => n + visibleLetters(w.text), 0);
  const fit = Math.max(0.65, Math.min(1, (tall ? 22 : 30) / Math.max(1, letters)));
  const base = language === "ne" ? (tall ? 104 : 88) : tall ? 96 : 80;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // Shorts: a bit below the middle (YouTube's buttons cover the bottom). Wide: near the bottom.
        top: tall ? "58%" : undefined,
        bottom: tall ? undefined : 70 * unit,
        display: "flex",
        justifyContent: "center",
        transform: `scale(${0.75 + 0.25 * enter})`,
        opacity: Math.min(1, enter * 1.5),
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          textAlign: "center",
          fontFamily: WORD_POP_FONT[language],
          fontWeight: 800,
          fontSize: base * fit * unit,
          lineHeight: 1.3,
          textTransform: language === "en" ? "uppercase" : undefined,
        }}
      >
        {page.words.map((w, i) => {
          const next = page.words[i + 1];
          // A word stays yellow until the next word starts (no flicker in tiny pauses).
          const active = nowMs >= w.startMs && nowMs < (next ? next.startMs : w.endMs + 200);
          const pop = active ? spring({ frame: frame - toFrame(w.startMs), fps, config: { damping: 10, mass: 0.5 } }) : 0;
          return (
            <span
              key={i}
              style={{
                // inline-block lets a long group wrap between words, and lets each word scale alone.
                display: "inline-block",
                margin: `0 ${14 * unit}px`,
                color: active ? "#FFE14D" : "white",
                transform: `scale(${1 + 0.18 * pop}) rotate(${-2 * pop}deg)`,
                // Thick black outline + hard shadow: readable on any background.
                WebkitTextStroke: `${12 * unit}px black`,
                paintOrder: "stroke fill",
                textShadow: `0 ${8 * unit}px 0 rgba(0,0,0,0.9)`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
