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
type PexelsPhoto = { id: number; url: string; src: Record<string, string> };

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

/**
 * Find a clip (or else a photo) for `query` and save it in `dir` as `name`.mp4/.jpg.
 * `used` = Pexels ids already used in this video, so scenes do not repeat.
 * Returns null when there is no key or nothing was found (the scene then gets a gradient).
 */
async function findPexels(
  query: string,
  format: VideoFormat,
  dir: string,
  name: string,
  used: Set<number>,
): Promise<FoundMedia | null> {
  const key = process.env.PEXELS_API_KEY!;
  const orientation = format === "SHORT" ? "portrait" : "landscape";
  const targetWidth = format === "SHORT" ? 1080 : 1920;
  const q = encodeURIComponent(query.trim());
  const { videos } = await pexels<{ videos: PexelsVideo[] }>(
    `https://api.pexels.com/videos/search?query=${q}&orientation=${orientation}&per_page=10`,
    key,
  );
  for (const v of videos ?? []) {
    if (used.has(v.id) || v.duration < 4) continue;
    // The MP4 closest to our video size (not a huge 4K file).
    const files = v.video_files
      .filter((f) => f.file_type === "video/mp4" && f.width)
      .sort((a, b) => Math.abs(a.width! - targetWidth) - Math.abs(b.width! - targetWidth));
    const best = files[0];
    if (!best) continue;
    const file = `${name}.mp4`;
    await download(best.link, path.join(dir, file));
    used.add(v.id);
    return { file, kind: "video", sourceUrl: v.url, provider: "pexels", id: v.id };
  }
  const { photos } = await pexels<{ photos: PexelsPhoto[] }>(
    `https://api.pexels.com/v1/search?query=${q}&orientation=${orientation}&per_page=10`,
    key,
  );
  const photo = (photos ?? []).find((p) => !used.has(p.id));
  if (!photo) return null;
  const file = `${name}.jpg`;
  await download(photo.src[orientation] ?? photo.src.large2x ?? photo.src.original!, path.join(dir, file));
  used.add(photo.id);
  return { file, kind: "image", sourceUrl: photo.url, provider: "pexels", id: photo.id };
}

type PixabayVideo = {
  id: number;
  pageURL: string;
  duration: number;
  videos: Record<string, { url: string; width: number; height: number; size: number }>;
};
type PixabayImage = { id: number; pageURL: string; largeImageURL: string; imageWidth: number; imageHeight: number };

async function pixabay<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Pixabay error ${res.status}`);
  return (await res.json()) as T;
}

async function findPixabay(
  query: string,
  format: VideoFormat,
  dir: string,
  name: string,
  used: Set<number>,
): Promise<FoundMedia | null> {
  const key = encodeURIComponent(process.env.PIXABAY_API_KEY!);
  const q = encodeURIComponent(query.trim().slice(0, 100));
  const tall = format === "SHORT";
  const targetWidth = tall ? 1080 : 1920;

  const { hits: videos } = await pixabay<{ hits: PixabayVideo[] }>(
    `https://pixabay.com/api/videos/?key=${key}&q=${q}&safesearch=true&per_page=20`,
  );
  // Pixabay has no "tall only" filter, so we prefer clips with the right shape.
  const ranked = (videos ?? [])
    .filter((v) => !used.has(v.id) && v.duration >= 4)
    .map((v) => {
      const sizes = Object.values(v.videos ?? {}).filter((f) => f?.url && f.width > 0);
      const best = sizes.sort((a, b) => Math.abs(a.width - targetWidth) - Math.abs(b.width - targetWidth))[0];
      const rightShape = best ? best.height > best.width === tall : false;
      return { v, best, rightShape };
    })
    .filter((x) => x.best)
    .sort((a, b) => Number(b.rightShape) - Number(a.rightShape));
  const pick = ranked[0];
  if (pick?.best) {
    const file = `${name}.mp4`;
    await download(pick.best.url, path.join(dir, file));
    used.add(pick.v.id);
    return { file, kind: "video", sourceUrl: pick.v.pageURL, provider: "pixabay", id: pick.v.id };
  }

  const { hits: images } = await pixabay<{ hits: PixabayImage[] }>(
    `https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&orientation=${tall ? "vertical" : "horizontal"}&safesearch=true&per_page=20`,
  );
  const image = (images ?? []).find((i) => !used.has(i.id));
  if (!image) return null;
  const file = `${name}.jpg`;
  await download(image.largeImageURL, path.join(dir, file));
  used.add(image.id);
  return { file, kind: "image", sourceUrl: image.pageURL, provider: "pixabay", id: image.id };
}

/**
 * Find a clip (or else a photo) for `query` and save it in `dir` as `name`.mp4/.jpg.
 * `used` = clip ids already used in this video, so scenes do not repeat.
 * Returns null when there is no key or nothing was found (the scene then gets a colour background).
 */
export async function findMedia(
  query: string,
  format: VideoFormat,
  dir: string,
  name: string,
  used: Set<number>,
): Promise<FoundMedia | null> {
  const provider = stockProvider();
  if (!provider || !query.trim()) return null;
  try {
    const find = provider === "pixabay" ? findPixabay : findPexels;
    return await find(query, format, dir, name, used);
  } catch (err) {
    // Never print the URL: it contains the Pixabay key.
    console.warn(`${provider}: no picture for "${query}" (${(err as Error).message}). Using a colour background.`);
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
