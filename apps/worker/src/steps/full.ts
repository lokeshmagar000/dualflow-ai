/**
 * FULL VIDEO (4-5 minutes, wide 16:9 for YouTube) helpers for the render step:
 *
 *  - sharedPictures: the Nepali and the English video use the SAME checked pictures. Each picture
 *    search (and its picture check) runs once per story, not once per language.
 *  - fullVideoExtras: what a full video adds to the normal new-style video: wide picture, chapter
 *    titles, more number cards, and a "Subscribe" pill instead of "Follow for Part 2".
 *  - makeShorts: cuts 2-3 tall shorts out of the full video. Each short is one whole chapter
 *    (25-75 seconds) with the same voice, pictures and cards, re-drawn tall (9:16). No AI is asked,
 *    so the shorts cost no AI money and no free voice requests.
 */
import { execFile } from "node:child_process";
import { copyFile, link, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { saveFile } from "@dualflow/storage";
import { clipProps, makeJobFolder, normaliseLoudness, pickClipWindows, renderVideoV2, type FoundMedia, type V2Props, type V2Text } from "@dualflow/video";
import type { Language } from "@dualflow/shared";

type Found = FoundMedia & { checked?: boolean };
type Store = { dir: Promise<string>; used: Set<number>; items: Map<string, Promise<Found | null>> };
const stores = new Map<string, Store>();

/**
 * One picture store per story (in this worker run). `find(key, search, jobDir, name)` runs
 * `search` only the first time a key is asked for; later calls (the other language) get the same
 * file, copied into their own job folder.
 */
export function sharedPictures(storyId: string) {
  let store = stores.get(storyId);
  if (!store) {
    store = { dir: makeJobFolder().then((j) => j.dir), used: new Set(), items: new Map() };
    stores.set(storyId, store);
  }
  const s = store;
  return {
    async find(key: string, search: (dir: string, used: Set<number>) => Promise<Found | null>, jobDir: string, name: string): Promise<Found | null> {
      let item = s.items.get(key);
      if (!item) {
        item = s.dir.then((dir) => search(dir, s.used)).catch((err: Error) => {
          console.warn(`[pictures] ${key}: search failed (${err.message}).`);
          return null;
        });
        s.items.set(key, item);
      }
      const found = await item;
      if (!found) return null;
      const file = `${name}${path.extname(found.file)}`;
      const from = path.join(await s.dir, found.file);
      const to = path.join(jobDir, file);
      // A "hard link" shares the file without copying it (saves disk); copy when that is not possible.
      await link(from, to).catch(() => copyFile(from, to));
      return { ...found, file };
    },
  };
}

type Chapter = { title: string; firstScene: number; lastScene: number };
type SceneRow = { order: number; startMs: number | null; endMs: number | null };

const SUBSCRIBE: Record<Language, string> = { ne: "थप जान्न सब्स्क्राइब गर्नुहोस्", en: "Subscribe for more" };
/** The pill in each short that sends viewers to the full video. */
const FULL_ON_CHANNEL: Record<Language, string> = { ne: "पूरा भिडियो हाम्रो च्यानलमा", en: "Full video on our channel" };

/** The chapters saved by the research step, with this language's titles. */
export function chaptersFor(research: unknown, text: Partial<V2Text> | null, language: Language): { firstOrder: number; lastOrder: number; title: string }[] {
  const list = ((research as { chapters?: Chapter[] } | null)?.chapters ?? []).filter((c) => c.firstScene > 0 && c.lastScene >= c.firstScene);
  const titles = text?.chapterTitles ?? [];
  return list.map((c, i) => ({
    firstOrder: c.firstScene,
    lastOrder: c.lastScene,
    // An English title is better than none in English; a Nepali video never shows an English title.
    title: titles[i]?.trim() || (language === "en" ? c.title : ""),
  }));
}

/** The extra prepareV2 settings for a full video. */
export function fullVideoExtras(research: unknown, text: Partial<V2Text> | null, scenes: SceneRow[], language: Language, durationMs: number) {
  const chapters = chaptersFor(research, text, language)
    .filter((c) => c.title)
    .map((c) => ({ order: c.firstOrder, title: c.title }));
  // "Subscribe" pill at the first line after 40% of the video (a short says "Follow for Part 2" instead).
  const at = scenes.find((s) => (s.startMs ?? 0) >= durationMs * 0.4)?.startMs ?? null;
  return {
    wide: true,
    chapters,
    maxCards: 8,
    follow: at ? { atMs: at, text: text?.followText?.trim() || SUBSCRIBE[language] } : null,
  };
}

/** A title of 4+ words becomes two hook lines (the short's first frame). */
export function hookFromTitle(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [words.join(" ")];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

export type SavedClip = { key: string; title: string; startSec: number; durationSec: number };

/** Cut, re-draw tall and upload 2-3 shorts. Returns what was saved (for the Ready page). */
export async function makeShorts(input: {
  props: V2Props;
  job: { dir: string; url: (name: string) => string };
  folder: string;
  language: Language;
  research: unknown;
  text: Partial<V2Text> | null;
  scenes: SceneRow[];
}): Promise<SavedClip[]> {
  const { props, job, folder, language } = input;
  const max = Number(process.env.FULL_SHORTS ?? 3);
  if (!(max > 0)) return [];
  const lines = input.scenes.map((s) => ({ order: s.order, startMs: s.startMs ?? 0, endMs: s.endMs ?? 0 }));
  const chapters = chaptersFor(input.research, input.text, language);
  const windows = pickClipWindows(chapters, lines, max);
  if (windows.length === 0) console.warn(`[shorts] ${language}: no chapter of 25-75 seconds, so no shorts.`);
  const saved: SavedClip[] = [];
  for (const [i, w] of windows.entries()) {
    const started = Date.now();
    const name = `short-${i + 1}`;
    const durationMs = w.toMs - w.fromMs;
    // Cut the same voice (sample-exact: the voice file is plain WAV).
    await promisify(execFile)("ffmpeg", [
      "-v", "error", "-y",
      "-ss", (w.fromMs / 1000).toFixed(3), "-t", (durationMs / 1000).toFixed(3),
      "-i", path.join(job.dir, "voice.wav"),
      "-acodec", "pcm_s16le", path.join(job.dir, `${name}.wav`),
    ]);
    const title = w.title || props.topic;
    const clip = clipProps(props, w.fromMs, w.toMs, {
      audioFile: job.url(`${name}.wav`),
      hookLines: hookFromTitle(title),
      follow: durationMs > 15_000 ? { atMs: Math.round(durationMs * 0.45), text: FULL_ON_CHANNEL[language] } : null,
    });
    const raw = path.join(job.dir, `${name}-raw.mp4`);
    const file = path.join(job.dir, `${name}.mp4`);
    await renderVideoV2(clip, raw);
    if (!(await normaliseLoudness(raw, file))) await copyFile(raw, file);
    const key = `${folder}/${name}.mp4`;
    await saveFile(key, await readFile(file));
    await Promise.all([raw, file].map((f) => rm(f, { force: true }))); // free the runner's disk
    saved.push({ key, title, startSec: Math.round(w.fromMs / 100) / 10, durationSec: Math.round(durationMs / 100) / 10 });
    console.log(`[shorts] ${language} short ${i + 1} (${Math.round(durationMs / 1000)} s, "${title}") made in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  return saved;
}
