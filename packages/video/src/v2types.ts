/**
 * STYLE V2 (sample only): what the new-style video needs to know.
 * The real pipeline still uses VideoProps (types.ts) until the owner confirms the new style.
 */
import type { Media, VideoWord } from "./types";

export type V2Shot = { startMs: number; endMs: number; media?: Media | null };

/** What kind of animation a card gets. */
export type V2CardKind = "number" | "year" | "date" | "time";

/**
 * A big number or short fact that pops up on screen.
 *   number  "1 / 193" + "countries"   -> counts up (0, 1, 2 ... 193)
 *   year    "1962"                    -> digits roll like a car's distance meter
 *   date    "16 December 1962"        -> calendar page flips to the day
 *   time    "10:30"                   -> clock hands turn to that time
 */
export type V2Card = { startMs: number; endMs: number; big: string; small: string; kind?: V2CardKind };

/** A news graphic (Nepal News & Politics videos). Pictures are file URLs in the job folder. */
export type V2NewsCard = {
  startMs: number;
  endMs: number;
  kind: "headline" | "quote" | "timeline" | "trip" | "flags" | "photo";
  title: string;
  by: string;
  date: string;
  from: string;
  to: string;
  /** Flag pictures, in order. */
  flags: string[];
  points: { when: string; label: string }[];
  photo?: { src: string; credit: string } | null;
};

/** News look: the red bar at the top ("NEWS EXPLAINED · 23 Nov 2026") and the graphics. */
export type V2News = { label: string; date: string; cards: V2NewsCard[] };

/** FULL VIDEO: a chapter title that slides in when that part of the video starts ("2 · What was signed"). */
export type V2Chapter = { startMs: number; n: number; title: string };

/** One sound effect: which file, when, how loud (0-1). */
export type V2Sfx = { atMs: number; src: string; volume: number };

export type V2Props = {
  language: "ne" | "en";
  audioFile: string;
  /** Length of the voice in ms. The video lasts this + 300 ms. */
  durationMs: number;
  shots: V2Shot[];
  words: VideoWord[];
  /** Key words (lower case, no punctuation): they get the marigold "sticker" box and a camera punch. */
  emphasis: string[];
  /** The hook text on the very first frame: 1-2 short lines. `highlight` = which line is marigold. */
  hook: { lines: string[]; highlight: number };
  /** Short topic chip at the top after the hook (so late viewers know what this is about). */
  topic: string;
  cards: V2Card[];
  sfx: V2Sfx[];
  musicFile: string | null;
  /** Music loudness while nobody talks (0-1). While the voice talks it drops to about 40% of this. */
  musicVolume: number;
  brand: string;
  brandTag: string;
  /** Politics videos: small "Source: ..." line under the topic chip ("" = none). */
  source?: string;
  /** Politics videos: series label above the topic chip, e.g. "PM Files" ("" = none). */
  series?: string;
  /** News / politics videos: news bar + news graphics (null = a normal facts video). */
  news?: V2News | null;
  /** A small "follow for part 2" pill in the middle of the video (not at the end). */
  follow: { atMs: number; text: string } | null;
  /**
   * FULL VIDEO (4-5 minutes): a wide 16:9 picture (1920x1080) for YouTube instead of a tall short.
   * Remotion fills a missing prop from Root.tsx's example, so always send it (false = tall short).
   */
  wide?: boolean;
  /** FULL VIDEO: chapter titles ([] = none). */
  chapters?: V2Chapter[];
};

/** Lower case, no punctuation: used to match key words. */
export const plain = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
