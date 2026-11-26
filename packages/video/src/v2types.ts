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
  /** A small "follow for part 2" pill in the middle of the video (not at the end). */
  follow: { atMs: number; text: string } | null;
};

/** Lower case, no punctuation: used to match key words. */
export const plain = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
