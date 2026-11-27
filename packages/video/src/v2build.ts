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
import { ding, hit, musicBed, newsBed, newsSting, pop, riser, toWav, whoosh } from "./sfx";
import type { Media, VideoWord } from "./types";
import { plain, type V2Card, type V2CardKind, type V2NewsCard, type V2Props } from "./v2types";

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
  /** News / politics videos: the news graphics the script asked for (pictures not downloaded yet). */
  newsCards?: {
    order: number;
    kind: V2NewsCard["kind"];
    title: string;
    by: string;
    person: string;
    date: string;
    from: string;
    to: string;
    countries: string[];
    points: { when: string; label: string }[];
  }[];
  /** News / politics videos: people named in the narration (their photo shows when the name is said). */
  people?: { order: number; person: string; name: string; role: string }[];
  /** FULL VIDEO: one title per chapter (same order as the research chapters), in this language. */
  chapterTitles?: string[];
};

/** A news graphic before it is timed: `order` = its spoken line; `say` = (photos) the name to wait for. */
export type NewsCardInput = Omit<V2NewsCard, "startMs" | "endMs"> & { order: number; say?: string };

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
  /** Politics videos: small "Source: ..." line shown under the topic chip. */
  source?: string;
  /** News / politics videos: the bar label, the date and the graphics (media already downloaded). */
  news?: { label: string; date: string; cards: NewsCardInput[] } | null;
  /** Politics videos: the series name shown as a small label above the topic chip, e.g. "PM Files". */
  seriesChip?: string;
  /** FULL VIDEO: wide 16:9 (1920x1080) instead of a tall short. */
  wide?: boolean;
  /** FULL VIDEO: chapter titles, each shown when its first spoken line (`order`) starts. */
  chapters?: { order: number; title: string }[];
  /** Most number cards (a short has room for 3; a 5-minute video for more). */
  maxCards?: number;
  /** Replaces the "Follow for Part 2" pill (null = no pill). */
  follow?: { atMs: number; text: string } | null;
};

const DEFAULT_FOLLOW = { en: "Follow for Part 2", ne: "भाग २ का लागि फलो गर्नुहोस्" };

export async function prepareV2(input: V2Input): Promise<V2Props> {
  const { job, language, words, lines } = input;
  const t = input.text ?? {};

  const fx = { whoosh: whoosh(), pop: pop(), hit: hit(), riser: riser(), ding: ding() };
  for (const [name, s] of Object.entries(fx)) await writeFile(path.join(job.dir, `${name}.wav`), toWav(s));
  const isNews = Boolean(input.news);
  await writeFile(path.join(job.dir, "music.wav"), toWav((isNews ? newsBed : musicBed)(input.durationMs / 1000 + 1)));
  if (isNews) await writeFile(path.join(job.dir, "sting.wav"), toWav(newsSting()));

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
  for (const c of wanted.slice(0, input.maxCards ?? 3)) {
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
    isNews ? { atMs: 0, src: job.url("sting.wav"), volume: 0.5 } : { atMs: 0, src: job.url("hit.wav"), volume: 0.55 },
    ...input.shots.slice(1).map((s) => ({ atMs: s.startMs - 120, src: job.url("whoosh.wav"), volume: 0.35 })),
    ...words.filter((w) => emphasisSet.has(plain(w.text)) && w.startMs > 900).map((w) => ({ atMs: w.startMs, src: job.url("pop.wav"), volume: 0.3 })),
  ];
  for (const c of cards) sfx.push({ atMs: c.startMs, src: job.url("ding.wav"), volume: 0.3 });
  if (payoff && payoff.startMs > 3000) {
    sfx.push({ atMs: payoff.startMs - 1200, src: job.url("riser.wav"), volume: 0.3 });
    sfx.push({ atMs: payoff.startMs, src: job.url("hit.wav"), volume: 0.35 });
  }

  // FULL VIDEO: chapter titles. Number cards and news graphics wait until the title has gone.
  const chapters = (input.chapters ?? [])
    .map((c) => ({ title: c.title.trim(), startMs: lines.find((l) => l.order === c.order)?.startMs ?? -1 }))
    .filter((c) => c.title && c.startMs >= 2800)
    .map((c, i) => ({ ...c, n: i + 1 }));
  const clear = <T extends { startMs: number; endMs: number }>(list: T[]) => keepClearOf(list, chapters.map((c) => ({ startMs: c.startMs, endMs: c.startMs + CHAPTER_MS })));
  const newsCards = input.news ? clear(timeNewsCards(input.news.cards, lines, cards, words)) : [];

  return {
    language,
    audioFile: input.audioFile,
    durationMs: input.durationMs,
    shots: input.shots,
    words,
    emphasis,
    hook,
    topic: t.topicChip || hook.lines.join(" "),
    cards: clear(cards),
    sfx,
    musicFile: job.url("music.wav"),
    musicVolume: Number(process.env.MUSIC_VOLUME ?? 0.28),
    brand: input.brand,
    brandTag: input.brandTag,
    news: input.news ? { label: input.news.label, date: input.news.date, cards: newsCards } : null,
    source: input.source ?? "",
    series: input.seriesChip ?? "",
    // News videos have no "Part 2" promise (they end with a question for the comments).
    follow:
      input.follow !== undefined
        ? input.follow
        : !isNews && loop && loop.startMs > 3000
          ? { atMs: loop.startMs, text: t.followText || DEFAULT_FOLLOW[language] }
          : null,
    wide: Boolean(input.wide),
    chapters,
  };
}

/** How long a chapter title stays on screen (VideoV2.tsx ChapterTitle). */
export const CHAPTER_MS = 3300;

/**
 * Keep cards out of the way of chapter titles: a card that starts during a title starts when the
 * title has gone; a card with less than 1.2 s left after that is dropped.
 */
export function keepClearOf<T extends { startMs: number; endMs: number }>(list: T[], blocked: { startMs: number; endMs: number }[]): T[] {
  const out: T[] = [];
  for (const item of list) {
    let { startMs } = item;
    for (const b of blocked) if (startMs < b.endMs && item.endMs > b.startMs) startMs = Math.max(startMs, b.endMs);
    if (item.endMs - startMs >= 1200) out.push({ ...item, startMs });
  }
  return out;
}

/**
 * SHORTS FROM THE FULL VIDEO: the props for one tall short that shows the part from `fromMs` to
 * `toMs` of a full video. Same voice (the caller cuts the audio file), same pictures, same cards,
 * moved to start at 0. No new AI text: the hook is the chapter title. Costs no AI money.
 */
export function clipProps(
  full: V2Props,
  fromMs: number,
  toMs: number,
  opts: { audioFile: string; hookLines: string[]; follow?: { atMs: number; text: string } | null; hitSrc?: string },
): V2Props {
  const inside = <T extends { startMs: number; endMs: number }>(x: T) => x.endMs > fromMs && x.startMs < toMs;
  const move = <T extends { startMs: number; endMs: number }>(x: T): T => ({
    ...x,
    startMs: Math.max(0, x.startMs - fromMs),
    endMs: Math.min(toMs, x.endMs) - fromMs,
  });
  const durationMs = toMs - fromMs;
  // The hook text covers the first 2.6 s: cards wait until it has gone.
  const afterHook = <T extends { startMs: number; endMs: number }>(x: T) => (x.startMs < 2700 ? { ...x, startMs: 2700 } : x);
  const fits = <T extends { startMs: number; endMs: number }>(x: T) => x.endMs - x.startMs >= 1200;
  const sfx = full.sfx
    .filter((s) => s.atMs >= fromMs + 200 && s.atMs < toMs)
    .map((s) => ({ ...s, atMs: s.atMs - fromMs }));
  const first = full.sfx[0];
  if (first) sfx.unshift({ ...first, atMs: 0, src: opts.hitSrc ?? first.src });
  return {
    ...full,
    audioFile: opts.audioFile,
    durationMs,
    shots: full.shots.filter(inside).map(move),
    words: full.words.filter(inside).map(move),
    hook: { lines: opts.hookLines.filter(Boolean).slice(0, 2), highlight: opts.hookLines.length > 1 ? 1 : 0 },
    cards: full.cards.filter(inside).map(move).map(afterHook).filter(fits),
    news: full.news ? { ...full.news, cards: full.news.cards.filter(inside).map(move).map(afterHook).filter(fits) } : null,
    sfx,
    follow: opts.follow ?? null,
    wide: false,
    chapters: [],
  };
}

/**
 * Which parts of a full video become shorts: whole chapters of 25-75 seconds (a short must make
 * sense alone, and a chapter is one complete idea), longest first, at most `max`, back in time order.
 * Chapters that are too long are cut at a line end before 75 s; the hook and the outro never.
 */
export function pickClipWindows(
  chapters: { firstOrder: number; lastOrder: number; title: string }[],
  lines: { order: number; startMs: number; endMs: number }[],
  max = 3,
  minMs = 25_000,
  maxMs = 75_000,
): { fromMs: number; toMs: number; title: string; firstOrder: number }[] {
  const windows: { fromMs: number; toMs: number; title: string; firstOrder: number }[] = [];
  for (const c of chapters) {
    const own = lines.filter((l) => l.order >= c.firstOrder && l.order <= c.lastOrder).sort((a, b) => a.order - b.order);
    if (own.length === 0) continue;
    const fromMs = Math.max(0, own[0]!.startMs - 150);
    // End at the last line that still fits in maxMs.
    let end = own[0]!.endMs;
    for (const l of own) if (l.endMs - fromMs <= maxMs) end = l.endMs;
    const toMs = end + 350;
    if (toMs - fromMs >= minMs) windows.push({ fromMs, toMs, title: c.title, firstOrder: c.firstOrder });
  }
  return windows
    .sort((a, b) => b.toMs - b.fromMs - (a.toMs - a.fromMs))
    .slice(0, max)
    .sort((a, b) => a.fromMs - b.fromMs);
}

/**
 * Show each news graphic during its spoken line (from 2.8 s, after the hook text).
 * People photos come first: each one appears on the word where the narration says the
 * person's name (e.g. "Modi"), for about 3 seconds. They win over number cards and other
 * news graphics; the other graphics never overlap a photo or a number card.
 */
export function timeNewsCards(
  wanted: NewsCardInput[],
  lines: { order: number; startMs: number; endMs: number }[],
  numberCards: { startMs: number; endMs: number }[] = [],
  words: VideoWord[] = [],
): V2NewsCard[] {
  const out: V2NewsCard[] = [];
  const overlaps = (a: { startMs: number; endMs: number }, startMs: number, endMs: number) => a.startMs < endMs && a.endMs > startMs;
  const photos = wanted.filter((c) => c.kind === "photo");
  const others = wanted.filter((c) => c.kind !== "photo");
  for (const { order, say, ...c } of photos) {
    const line = lines.find((l) => l.order === order);
    if (!line) continue;
    const at = say ? nameSpokenAt(say, words, line) : null;
    const startMs = Math.max((at ?? line.startMs + 150) - 120, 1800);
    const endMs = startMs + 3000;
    if (startMs > line.endMs + 400) continue;
    if (out.some((o) => overlaps(o, startMs, endMs))) continue;
    out.push({ ...c, startMs, endMs });
  }
  for (const { order, say: _say, ...c } of others) {
    const line = lines.find((l) => l.order === order);
    if (!line) continue;
    const startMs = Math.max(line.startMs + 150, 2800);
    const endMs = Math.max(line.endMs + 250, startMs + 2600);
    if (startMs > line.endMs + 400) continue;
    if (numberCards.some((n) => overlaps(n, startMs, endMs))) continue;
    if (out.some((o) => overlaps(o, startMs, endMs))) continue;
    out.push({ ...c, startMs, endMs });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * When is `name` said inside this line? Matches the first word of the name that the voice
 * really spoke ("Modi" matches "Modi's"; Nepali "मोदी" matches "मोदीले"). Null = not found.
 */
export function nameSpokenAt(name: string, words: VideoWord[], line: { startMs: number; endMs: number }): number | null {
  const parts = name.split(/\s+/).map(plain).filter((p) => p.length > 1);
  if (parts.length === 0) return null;
  const inLine = words.filter((w) => w.startMs >= line.startMs - 200 && w.startMs <= line.endMs + 200);
  for (const w of inLine) {
    const said = plain(w.text);
    if (said && parts.some((p) => said.startsWith(p) || (said.length > 2 && p.startsWith(said)))) return w.startMs;
  }
  return null;
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
