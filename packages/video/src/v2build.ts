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
import { plain, type V2Card, type V2CardKind, type V2Props } from "./v2types";

/** The on-screen text the script step saves for each video (Variant.style). */
export type V2Text = {
  hookLines: string[];
  hookHighlight: number;
  topicChip: string;
  emphasis: string[];
  /** 0-3 animated cards, each tied to a spoken line (order). */
  cards: { order: number; kind?: V2CardKind; big: string; small: string }[];
  /** Older scripts saved one number card here. */
  numberCard?: { order: number; big: string; small: string };
  followText: string;
};

/** Guess the card kind from its text when the script did not say. */
export function cardKind(big: string, kind?: string): V2CardKind {
  if (kind === "number" || kind === "year" || kind === "date" || kind === "time") return kind;
  if (/^\d{1,2}:\d{2}/.test(big.trim())) return "time";
  if (/^(1[0-9]|20)\d{2}$/.test(big.trim())) return "year";
  return "number";
}

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
  const wanted = (t.cards?.length ? t.cards : t.numberCard ? [t.numberCard] : []).filter((c) => c.order > 0 && c.big);
  const used = new Set<number>();
  const cards: V2Card[] = [];
  for (const c of wanted.slice(0, 3)) {
    const line = lines.find((l) => l.order === c.order);
    if (!line || used.has(line.order)) continue;
    const startMs = Math.max(line.startMs + 200, 2700); // never on top of the hook text
    if (startMs > line.endMs + 400) continue;
    used.add(line.order);
    const kind = cardKind(c.big, (c as { kind?: string }).kind);
    cards.push({ startMs, endMs: Math.max(line.endMs + 300, startMs + (kind === "number" ? 2200 : 2800)), big: c.big, small: c.small ?? "", kind });
  }
  // Cards must not overlap: cut the earlier one short.
  cards.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i + 1 < cards.length; i++) cards[i]!.endMs = Math.min(cards[i]!.endMs, cards[i + 1]!.startMs - 150);
  const emphasisSet = new Set(emphasis);

  const sfx: V2Props["sfx"] = [
    { atMs: 0, src: job.url("hit.wav"), volume: 0.55 },
    ...input.shots.slice(1).map((s) => ({ atMs: s.startMs - 120, src: job.url("whoosh.wav"), volume: 0.35 })),
    ...words.filter((w) => emphasisSet.has(plain(w.text)) && w.startMs > 900).map((w) => ({ atMs: w.startMs, src: job.url("pop.wav"), volume: 0.3 })),
  ];
  for (const c of cards) sfx.push({ atMs: c.startMs, src: job.url("ding.wav"), volume: 0.3 });
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
    cards,
    sfx,
    musicFile: job.url("music.wav"),
    musicVolume: Number(process.env.MUSIC_VOLUME ?? 0.28),
    brand: input.brand,
    brandTag: input.brandTag,
    follow: loop && loop.startMs > 3000 ? { atMs: loop.startMs, text: t.followText || DEFAULT_FOLLOW[language] } : null,
  };
}

/**
 * VARIETY: a shot that stays on screen too long feels "stuck". Cut every shot longer
 * than `maxMs` into pieces of about `pieceMs`. The first piece keeps the original
 * picture search; the extra pieces are marked `extra: true` so the caller can fill them
 * with other on-topic pictures (people, places, maps ... from the research "broll" list).
 */
export function splitLongShots<T extends { startMs: number; endMs: number }>(
  shots: T[],
  maxMs = 3200,
  pieceMs = 2200,
): (T & { extra: boolean })[] {
  const out: (T & { extra: boolean })[] = [];
  for (const s of shots) {
    const len = s.endMs - s.startMs;
    if (len <= maxMs) {
      out.push({ ...s, extra: false });
      continue;
    }
    const n = Math.max(2, Math.round(len / pieceMs));
    for (let i = 0; i < n; i++) {
      out.push({ ...s, startMs: Math.round(s.startMs + (len * i) / n), endMs: Math.round(s.startMs + (len * (i + 1)) / n), extra: i > 0 });
    }
  }
  return out;
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
