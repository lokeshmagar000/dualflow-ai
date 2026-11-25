/**
 * STYLE V2: turn one video's data into the props for VideoV2.tsx, and write the
 * code-made music and sound effects into the job folder.
 *
 * Where each effect goes (see the style guide):
 *   hit     frame 1 (hook text slams in) and the "payoff" line (biggest surprise)
 *   whoosh  every picture change
 *   pop     every key word sticker
 *   ding    when the number card appears
 *   riser   1.2 s before the payoff line
 */
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ding, hit, musicBed, pop, riser, toWav, whoosh } from "./sfx";
import type { Media, VideoWord } from "./types";
import { plain, type V2Props } from "./v2types";

/** The on-screen text the script step saves for each video (Variant.style). */
export type V2Text = {
  hookLines: string[];
  hookHighlight: number;
  topicChip: string;
  emphasis: string[];
  numberCard: { order: number; big: string; small: string };
  followText: string;
};

export type V2Input = {
  job: { dir: string; url: (name: string) => string };
  language: "ne" | "en";
  audioFile: string;
  durationMs: number;
  words: VideoWord[];
  /** Spoken lines in order, with their plan purpose (hook, open_loop, payoff, loop_back...). */
  lines: { order: number; purpose: string | null; startMs: number; endMs: number }[];
  shots: { startMs: number; endMs: number; media: Media | null }[];
  text: Partial<V2Text> | null;
  /** Used when the script gave no hook text (older scripts). */
  fallbackHook: string;
  brand: string;
  brandTag: string;
};

const DEFAULT_FOLLOW = { en: "Follow for Part 2", ne: "भाग २ का लागि फलो गर्नुहोस्" };

export async function prepareV2(input: V2Input): Promise<V2Props> {
  const { job, language, words, lines } = input;
  const t = input.text ?? {};

  const fx = { whoosh: whoosh(), pop: pop(), hit: hit(), riser: riser(), ding: ding() };
  for (const [name, s] of Object.entries(fx)) await writeFile(path.join(job.dir, `${name}.wav`), toWav(s));
  await writeFile(path.join(job.dir, "music.wav"), toWav(musicBed(input.durationMs / 1000 + 1)));

  // Key words: only the ones really spoken (the AI sometimes changes a word).
  const spoken = new Set(words.map((w) => plain(w.text)));
  const emphasis = (t.emphasis ?? []).map(plain).filter((w) => w && spoken.has(w));

  const hookLines = (t.hookLines ?? []).filter(Boolean).slice(0, 2);
  const hook = hookLines.length
    ? { lines: hookLines, highlight: Math.min(hookLines.length - 1, Math.max(0, t.hookHighlight ?? 0)) }
    : { lines: [input.fallbackHook], highlight: 0 };

  const payoff = lines.find((l) => l.purpose === "payoff") ?? lines.at(-2);
  const loop = lines.find((l) => l.purpose === "open_loop") ?? lines[Math.floor(lines.length * 0.4)];
  const cardLine = t.numberCard?.order && t.numberCard.big ? lines.find((l) => l.order === t.numberCard!.order) : undefined;
  const emphasisSet = new Set(emphasis);

  const sfx: V2Props["sfx"] = [
    { atMs: 0, src: job.url("hit.wav"), volume: 0.55 },
    ...input.shots.slice(1).map((s) => ({ atMs: s.startMs - 120, src: job.url("whoosh.wav"), volume: 0.35 })),
    ...words.filter((w) => emphasisSet.has(plain(w.text)) && w.startMs > 900).map((w) => ({ atMs: w.startMs, src: job.url("pop.wav"), volume: 0.3 })),
  ];
  if (cardLine) sfx.push({ atMs: cardLine.startMs + 200, src: job.url("ding.wav"), volume: 0.3 });
  if (payoff && payoff.startMs > 3000) {
    sfx.push({ atMs: payoff.startMs - 1200, src: job.url("riser.wav"), volume: 0.3 });
    sfx.push({ atMs: payoff.startMs, src: job.url("hit.wav"), volume: 0.35 });
  }

  return {
    language,
    audioFile: input.audioFile,
    durationMs: input.durationMs,
    shots: input.shots,
    words,
    emphasis,
    hook,
    topic: t.topicChip || hook.lines.join(" "),
    cards: cardLine
      ? [{ startMs: cardLine.startMs + 200, endMs: Math.max(cardLine.endMs + 300, cardLine.startMs + 2200), big: t.numberCard!.big, small: t.numberCard!.small }]
      : [],
    sfx,
    musicFile: job.url("music.wav"),
    musicVolume: Number(process.env.MUSIC_VOLUME ?? 0.28),
    brand: input.brand,
    brandTag: input.brandTag,
    follow: loop && loop.startMs > 3000 ? { atMs: loop.startMs, text: t.followText || DEFAULT_FOLLOW[language] } : null,
  };
}

/**
 * Make the sound as loud as other videos on the platforms (about -14 LUFS, peaks under -1.5 dB).
 * The picture is copied as it is (fast). Needs FFmpeg; without it the file stays as it was.
 */
export async function normaliseLoudness(input: string, output: string): Promise<boolean> {
  try {
    await promisify(execFile)("ffmpeg", ["-v", "error", "-y", "-i", input, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", output]);
    return true;
  } catch (err) {
    console.warn(`Loudness step skipped (${(err as Error).message.split("\n")[0]}).`);
    return false;
  }
}
