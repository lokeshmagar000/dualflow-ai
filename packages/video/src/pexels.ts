/**
 * Free stock videos and photos from Pexels (PEXELS_API_KEY, free at pexels.com/api).
 *
 * Pexels license: free to use, also in videos that earn money, no credit required
 * (we still save the link). Without a key, scenes use coloured backgrounds instead.
 *
 * Free limit: 200 requests an hour, 20,000 a month. One scene uses 1 or 2.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { VideoFormat } from "./types";

export type FoundMedia = {
  /** File name inside the job folder. */
  file: string;
  kind: "video" | "image";
  /** The Pexels page, saved for credits. */
  sourceUrl: string;
  pexelsId: number;
};

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
export async function findMedia(
  query: string,
  format: VideoFormat,
  dir: string,
  name: string,
  used: Set<number>,
): Promise<FoundMedia | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return null;
  const orientation = format === "SHORT" ? "portrait" : "landscape";
  const targetWidth = format === "SHORT" ? 1080 : 1920;
  const q = encodeURIComponent(query.trim());
  try {
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
      return { file, kind: "video", sourceUrl: v.url, pexelsId: v.id };
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
    return { file, kind: "image", sourceUrl: photo.url, pexelsId: photo.id };
  } catch (err) {
    console.warn(`Pexels: no picture for "${query}" (${(err as Error).message}). Using a colour background.`);
    return null;
  }
}
