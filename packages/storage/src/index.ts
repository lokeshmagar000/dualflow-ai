/**
 * File storage for audio, subtitles and (later) videos.
 *
 * Budget mode: files are saved on the computer's own disk, in the folder
 * STORAGE_DIR (default: "storage" at the top of the project). It is free.
 * Later we can swap this for Cloudflare R2 by changing only this file,
 * because the rest of the app only uses saveFile / readFile / fileExists.
 *
 * A "key" is the file's name inside storage, e.g. "stories/abc/ne/voice.wav".
 */
import { mkdir, readFile as fsReadFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The project's top folder: this file is at packages/storage/src/index.ts. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function storageRoot(): string {
  return path.resolve(PROJECT_ROOT, process.env.STORAGE_DIR || "storage");
}

/**
 * Turn a key into a full file path, and refuse anything unsafe.
 * This stops "path traversal" tricks like "../../.env" that try to read
 * files outside the storage folder.
 */
export function pathForKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) || key.split("/").includes("..")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  const root = storageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error(`Unsafe storage key: ${key}`);
  return full;
}

export async function saveFile(key: string, data: Buffer | string): Promise<void> {
  const full = pathForKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readFile(key: string): Promise<Buffer> {
  return fsReadFile(pathForKey(key));
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    return (await stat(pathForKey(key))).isFile();
  } catch {
    return false;
  }
}

/** Guess the content type from the file ending (used when sending files to the browser). */
export function contentTypeFor(key: string): string {
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".srt")) return "application/x-subrip; charset=utf-8";
  if (key.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}
