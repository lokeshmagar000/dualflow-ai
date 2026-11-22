/**
 * Free stock videos and photos for the scene backgrounds.
 *
 * Which site (STOCK_PROVIDER, default "auto" = the first one that has a key):
 *   pixabay  PIXABAY_API_KEY  free key at pixabay.com/api/docs (log in first)
 *            Pixabay Content License: free, also in videos that earn money,
 *            no credit required, as long as the clip is part of a new work
 *            (ours are: voice + text + subtitles on top). Limit: 100 searches a minute.
 *   pexels   PEXELS_API_KEY   free key at pexels.com/api (new keys paused in Nov 2026)
 *   none     no clips: scenes get moving colour backgrounds
 * We download each clip into the job folder (no hot-linking) and save the
 * page link for credits.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoFormat } from "./types";

export type FoundMedia = {
  /** File name inside the job folder. */
  file: string;
  kind: "video" | "image";
  /** The page on the stock site, saved for credits. */
  sourceUrl: string;
  /** "pixabay" or "pexels". */
  provider: string;
  /** The clip's id on that site. */
  id: number;
};

/** Which stock site to use, or null for colour backgrounds. */
export function stockProvider(): "pixabay" | "pexels" | null {
  const choice = (process.env.STOCK_PROVIDER ?? "auto").toLowerCase();
  if (choice === "none") return null;
  if (choice === "pixabay") return process.env.PIXABAY_API_KEY ? "pixabay" : null;
  if (choice === "pexels") return process.env.PEXELS_API_KEY ? "pexels" : null;
  if (process.env.PIXABAY_API_KEY) return "pixabay";
  if (process.env.PEXELS_API_KEY) return "pexels";
  return null;
}

type PexelsVideo = {
  id: number;
  url: string;
  duration: number;
  video_files: { link: string; width: number | null; height: number | null; file_type: string }[];
};
type PexelsPhoto = { id: number; url: string; alt?: string; src: Record<string, string> };

async function pexels<T>(url: string, key: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Pexels error ${res.status}`);
  return (await res.json()) as T;
}

async function download(url: string, file: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

/** One search result from any stock site, before we download it. */
export type Candidate = {
  id: number;
  kind: "video" | "image";
  /** Words that describe the clip (Pixabay tags, or the words in a Pexels page address). */
  tags: string;
  /** Clip length in seconds (0 for photos). */
  duration: number;
  /** True when the clip has the video's shape (tall for Shorts, wide for long videos). */
  rightShape: boolean;
  downloadUrl: string;
  sourceUrl: string;
};

const STOP_WORDS = new Set(["a", "an", "the", "of", "in", "on", "at", "with", "and", "or", "to", "for", "from", "by"]);

/** The meaningful words of a search phrase: "yaks on a snowy hill" -> ["yak", "snowy", "hill"]. */
function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** How much of the search phrase the clip's tags really mention (0 = nothing, 1 = every word). */
export function tagMatch(query: string, tags: string): number {
  const want = keywords(query);
  if (want.length === 0) return 0;
  const have = new Set(keywords(tags));
  // "mountain" also matches the tag "mountains" (and "climber" matches "climbers") through the plural cut above.
  return want.filter((w) => have.has(w)).length / want.length;
}

/**
 * Put the results in the best order for this scene:
 * clips whose tags match the scene's words first, then the right shape,
 * then long enough to cover the whole scene without stopping.
 */
export function rankCandidates(query: string, candidates: Candidate[], minSeconds = 0): (Candidate & { score: number; match: number })[] {
  return candidates
    .map((c, position) => {
      const match = tagMatch(query, c.tags);
      const longEnough = c.kind === "image" || c.duration >= Math.max(4, minSeconds) ? 1 : 0;
      // The site's own order counts a little too (its first results are usually the best).
      const score = match * 4 + (c.rightShape ? 1.5 : 0) + longEnough - position * 0.05;
      return { ...c, score, match };
    })
    .sort((a, b) => b.score - a.score);
}

/** Search one site for clips (or photos, when `photos` is true). */
async function search(
  provider: "pixabay" | "pexels",
  query: string,
  format: VideoFormat,
  photos: boolean,
): Promise<Candidate[]> {
  const tall = format === "SHORT";
  const targetWidth = tall ? 1080 : 1920;
  if (provider === "pixabay") {
    const key = encodeURIComponent(process.env.PIXABAY_API_KEY!);
    const q = encodeURIComponent(query.trim().slice(0, 100));
    if (photos) {
      const { hits } = await pixabay<{ hits: PixabayImage[] }>(
        `https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&orientation=${tall ? "vertical" : "horizontal"}&safesearch=true&per_page=20`,
      );
      return (hits ?? []).map((i) => ({
        id: i.id,
        kind: "image" as const,
        tags: i.tags ?? "",
        duration: 0,
        rightShape: true,
        downloadUrl: i.largeImageURL,
        sourceUrl: i.pageURL,
      }));
    }
    const { hits } = await pixabay<{ hits: PixabayVideo[] }>(
      `https://pixabay.com/api/videos/?key=${key}&q=${q}&safesearch=true&per_page=20`,
    );
    return (hits ?? []).flatMap((v) => {
      // The file closest to our video size (not a huge 4K file).
      const sizes = Object.values(v.videos ?? {}).filter((f) => f?.url && f.width > 0);
      const best = sizes.sort((a, b) => Math.abs(a.width - targetWidth) - Math.abs(b.width - targetWidth))[0];
      if (!best) return [];
      return [
        {
          id: v.id,
          kind: "video" as const,
          tags: v.tags ?? "",
          duration: v.duration,
          rightShape: best.height > best.width === tall,
          downloadUrl: best.url,
          sourceUrl: v.pageURL,
        },
      ];
    });
  }

  const key = process.env.PEXELS_API_KEY!;
  const orientation = tall ? "portrait" : "landscape";
  const q = encodeURIComponent(query.trim());
  // Pexels has no tags, but its page address describes the clip: /video/yak-walking-in-snow-12345/
  const slugWords = (url: string) => url.split("/").filter(Boolean).pop()?.replace(/-?\d+$/, "").replace(/-/g, " ") ?? "";
  if (photos) {
    const { photos: list } = await pexels<{ photos: PexelsPhoto[] }>(
      `https://api.pexels.com/v1/search?query=${q}&orientation=${orientation}&per_page=15`,
      key,
    );
    return (list ?? []).map((p) => ({
      id: p.id,
      kind: "image" as const,
      tags: `${p.alt ?? ""} ${slugWords(p.url)}`,
      duration: 0,
      rightShape: true,
      downloadUrl: p.src[orientation] ?? p.src.large2x ?? p.src.original!,
      sourceUrl: p.url,
    }));
  }
  const { videos } = await pexels<{ videos: PexelsVideo[] }>(
    `https://api.pexels.com/videos/search?query=${q}&orientation=${orientation}&per_page=15`,
    key,
  );
  return (videos ?? []).flatMap((v) => {
    const best = v.video_files
      .filter((f) => f.file_type === "video/mp4" && f.width)
      .sort((a, b) => Math.abs(a.width! - targetWidth) - Math.abs(b.width! - targetWidth))[0];
    if (!best) return [];
    return [
      {
        id: v.id,
        kind: "video" as const,
        tags: slugWords(v.url),
        duration: v.duration,
        rightShape: (best.height ?? 0) > (best.width ?? 0) === tall,
        downloadUrl: best.link,
        sourceUrl: v.url,
      },
    ];
  });
}

type PixabayVideo = {
  id: number;
  pageURL: string;
  tags?: string;
  duration: number;
  videos: Record<string, { url: string; width: number; height: number; size: number }>;
};
type PixabayImage = {
  id: number;
  pageURL: string;
  tags?: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
};

async function pixabay<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Pixabay error ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Find the clip (or else a photo) that best SHOWS what a scene says, and save it
 * in `dir` as `name`.mp4/.jpg.
 *
 * `queries` = search phrases, best first (the scene's picture words, then simpler
 * backup words). We try them in order and stop as soon as a clip's tags clearly
 * match. A clip whose tags match nothing is only used when nothing better exists.
 * `used` = clip ids already used in this video, so scenes do not repeat.
 * `minSeconds` = how long the scene lasts (longer clips are preferred, so the picture never freezes).
 * Returns null when there is no key or nothing was found (the scene then gets a colour background).
 */
export async function findMedia(
  queries: string | (string | null | undefined)[],
  format: VideoFormat,
  dir: string,
  name: string,
  used: Set<number>,
  minSeconds = 0,
): Promise<FoundMedia | null> {
  const provider = stockProvider();
  const list = [...new Set((Array.isArray(queries) ? queries : [queries]).map((q) => q?.trim() ?? "").filter(Boolean))];
  if (!provider || list.length === 0) return null;

  const take = async (c: Candidate): Promise<FoundMedia> => {
    const file = `${name}.${c.kind === "video" ? "mp4" : "jpg"}`;
    await download(c.downloadUrl, path.join(dir, file));
    used.add(c.id);
    return { file, kind: c.kind, sourceUrl: c.sourceUrl, provider, id: c.id };
  };

  try {
    // Moving clips first, then photos (a photo that matches beats a clip that does not).
    const weak: (Candidate & { score: number })[] = [];
    let problem: string | undefined;
    for (const photos of [false, true]) {
      for (const query of list) {
        let found: Candidate[];
        try {
          found = (await search(provider, query, format, photos)).filter((c) => !used.has(c.id));
        } catch (err) {
          problem ??= (err as Error).message; // one failed search must not lose a good result from another
          continue;
        }
        const best = rankCandidates(query, found, minSeconds)[0];
        if (!best) continue;
        // Good match (at least half of the words are in the tags): use it now.
        if (best.match >= 0.5) return await take(best);
        weak.push(best);
      }
    }
    // Nothing clearly matches: use the best weak result, a clip if there is one.
    const pick = weak.sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video") || b.score - a.score)[0];
    if (pick) return await take(pick);
    if (problem) console.warn(`${provider}: no picture for "${list[0]}" (${problem}). Using a colour background.`);
    return null;
  } catch (err) {
    // Never print the URL: it contains the Pixabay key.
    console.warn(`${provider}: no picture for "${list[0]}" (${(err as Error).message}). Using a colour background.`);
    return null;
  }
}

/**
 * Find a PHOTO for the thumbnail (photos are sharper than a frame from a clip).
 * `tall` = portrait photo (Shorts, Reels, feed posts); otherwise landscape (YouTube).
 * Pixabay: "popular" order, so we get the eye-catching pictures first.
 * Returns null when there is no key or nothing was found.
 */
export async function findPhoto(
  query: string,
  tall: boolean,
  dir: string,
  name: string,
  used: Set<number>,
): Promise<FoundMedia | null> {
  const provider = stockProvider();
  if (!provider || !query.trim()) return null;
  try {
    if (provider === "pixabay") {
      const key = encodeURIComponent(process.env.PIXABAY_API_KEY!);
      const q = encodeURIComponent(query.trim().slice(0, 100));
      const { hits } = await pixabay<{ hits: PixabayImage[] }>(
        `https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&orientation=${tall ? "vertical" : "horizontal"}&order=popular&min_width=1080&safesearch=true&per_page=20`,
      );
      const image = (hits ?? []).find((i) => !used.has(i.id));
      if (!image) return null;
      const file = `${name}.jpg`;
      await download(image.largeImageURL, path.join(dir, file));
      used.add(image.id);
      return { file, kind: "image", sourceUrl: image.pageURL, provider: "pixabay", id: image.id };
    }
    const orientation = tall ? "portrait" : "landscape";
    const { photos } = await pexels<{ photos: PexelsPhoto[] }>(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query.trim())}&orientation=${orientation}&per_page=10`,
      process.env.PEXELS_API_KEY!,
    );
    const photo = (photos ?? []).find((p) => !used.has(p.id));
    if (!photo) return null;
    const file = `${name}.jpg`;
    await download(photo.src[orientation] ?? photo.src.large2x ?? photo.src.original!, path.join(dir, file));
    used.add(photo.id);
    return { file, kind: "image", sourceUrl: photo.url, provider: "pexels", id: photo.id };
  } catch (err) {
    console.warn(`${provider}: no thumbnail photo for "${query}" (${(err as Error).message}).`);
    return null;
  }
}
