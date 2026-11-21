/**
 * File storage for audio, subtitles and videos.
 *
 * Pick where files go with STORAGE:
 *   "local" (default) the computer's own disk, folder STORAGE_DIR (default "storage"). Free.
 *   "r2"    Cloudflare R2 (free: 10 GB, downloads free). Needed on the free plan,
 *           because GitHub Actions machines are deleted after each run and
 *           Render's free disk is wiped on every restart.
 *
 * The rest of the app only uses saveFile / readFile / fileExists / deleteFile /
 * listFiles, so switching is one setting.
 *
 * A "key" is the file's name inside storage, e.g. "stories/abc/ne/voice.wav".
 */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { mkdir, readdir, readFile as fsReadFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { r2Delete, r2Exists, r2Get, r2List, r2PresignGet, r2PresignPut, r2Put, r2Size, r2Stream } from "./r2";

/** The project's top folder: this file is at packages/storage/src/index.ts. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export type StorageDriver = "local" | "r2";
export function storageDriver(): StorageDriver {
  const choice = (process.env.STORAGE ?? "local").toLowerCase();
  if (choice === "local" || choice === "r2") return choice;
  throw new Error(`Unknown STORAGE "${choice}". Use "local" or "r2".`);
}

export function storageRoot(): string {
  return path.resolve(PROJECT_ROOT, process.env.STORAGE_DIR || "storage");
}

/**
 * Check a key is safe. This stops "path traversal" tricks like "../../.env"
 * that try to reach files outside the storage folder.
 */
export function checkKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) || key.split("/").some((p) => p === ".." || p === ".")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return key;
}

/** Turn a key into a full file path on this computer (local storage). */
export function pathForKey(key: string): string {
  checkKey(key);
  const root = storageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error(`Unsafe storage key: ${key}`);
  return full;
}

export async function saveFile(key: string, data: Buffer | string): Promise<void> {
  if (storageDriver() === "r2") return r2Put(checkKey(key), data, contentTypeFor(key));
  const full = pathForKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readFile(key: string): Promise<Buffer> {
  if (storageDriver() === "r2") return r2Get(checkKey(key));
  return fsReadFile(pathForKey(key));
}

/** Open a file as a stream (used for the "Download all" zip, so big videos are not loaded whole). */
export async function readStream(key: string): Promise<Readable> {
  if (storageDriver() === "r2") return Readable.fromWeb((await r2Stream(checkKey(key))) as WebReadableStream<Uint8Array>);
  return createReadStream(pathForKey(key));
}

export async function fileExists(key: string): Promise<boolean> {
  if (storageDriver() === "r2") return r2Exists(checkKey(key));
  try {
    return (await stat(pathForKey(key))).isFile();
  } catch {
    return false;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (storageDriver() === "r2") return r2Delete(checkKey(key));
  await rm(pathForKey(key), { force: true });
}

/** The file's size in bytes, or null when there is no such file. */
export async function fileSize(key: string): Promise<number | null> {
  if (storageDriver() === "r2") return r2Size(checkKey(key));
  try {
    const s = await stat(pathForKey(key));
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

/**
 * An address the browser can PUT one file to, for one hour (R2 only).
 * Local storage has no such address: the API takes the file itself instead.
 */
export async function uploadUrlFor(key: string): Promise<string | null> {
  if (storageDriver() !== "r2") return null;
  return r2PresignPut(checkKey(key));
}

/**
 * An address the browser can download one file from, for one hour (R2 only).
 * Local storage has none: the API sends the file itself instead.
 */
export async function downloadUrlFor(key: string, opts: { fileName?: string; inline?: boolean } = {}): Promise<string | null> {
  if (storageDriver() !== "r2") return null;
  return r2PresignGet(checkKey(key), opts);
}

export interface StoredFile {
  key: string;
  size: number;
  modified: Date;
}

/** Every file whose key starts with `prefix` (e.g. "stories/abc/"). */
export async function listFiles(prefix: string): Promise<StoredFile[]> {
  if (prefix) checkKey(prefix);
  if (storageDriver() === "r2") return r2List(prefix);
  const root = storageRoot();
  const start = prefix ? pathForKey(prefix.replace(/\/$/, "")) : root;
  const found: StoredFile[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // folder does not exist yet
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        const s = await stat(full);
        found.push({ key: path.relative(root, full).split(path.sep).join("/"), size: s.size, modified: s.mtime });
      }
    }
  }
  await walk(start);
  return found.filter((f) => f.key.startsWith(prefix));
}

/** Guess the content type from the file ending (used when sending files to the browser). */
export function contentTypeFor(key: string): string {
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".mov")) return "video/quicktime";
  if (key.endsWith(".srt")) return "application/x-subrip; charset=utf-8";
  if (key.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}
