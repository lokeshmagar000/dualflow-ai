/**
 * Render a video (.mp4) or a thumbnail (.jpg) with Remotion.
 *
 * How it works:
 *   1. "Bundle": Remotion packs our React video code into a small web page (once per run).
 *   2. A tiny local web server shares the job folder (voice, pictures) with that page.
 *   3. Remotion opens the page in a headless Chrome, takes a picture of every frame,
 *      and FFmpeg joins the pictures and the voice into an .mp4.
 *
 * Chrome draws Nepali letters (joined letters like "क्ष") correctly, which FFmpeg
 * subtitles alone get wrong.
 *
 * Settings: REMOTION_BROWSER = path to Chrome (optional; Remotion downloads one if empty)
 *           RENDER_CONCURRENCY = how many frames at once (default: Remotion decides)
 * Remotion is free for individuals and companies of up to 3 people.
 */
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { ThumbnailProps, VideoProps } from "./types";
import type { V2Props } from "./v2types";

const ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "remotion/index.ts");
const ROOT = process.env.RENDER_DIR || path.join(tmpdir(), "dualflow-render");

const TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

let bundled: Promise<string> | undefined;
let server: Promise<{ server: Server; base: string }> | undefined;

function getBundle(): Promise<string> {
  bundled ??= bundle({ entryPoint: ENTRY });
  return bundled;
}

/** A tiny web server that shares files inside ROOT (and nothing outside it). */
function getServer() {
  server ??= new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      const file = path.join(ROOT, decodeURIComponent((req.url ?? "/").split("?")[0]!));
      if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
      try {
        const info = await stat(file);
        const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
        // Video players ask for parts of a file ("range requests").
        if (range) {
          const start = range[1] ? Number(range[1]) : 0;
          const end = range[2] ? Number(range[2]) : info.size - 1;
          res.writeHead(206, {
            "content-type": type,
            "content-range": `bytes ${start}-${end}/${info.size}`,
            "content-length": end - start + 1,
            "accept-ranges": "bytes",
            "access-control-allow-origin": "*",
          });
          createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          "content-type": type,
          "content-length": info.size,
          "accept-ranges": "bytes",
          "access-control-allow-origin": "*",
        });
        createReadStream(file).pipe(res);
      } catch {
        res.writeHead(404).end();
      }
    });
    s.on("error", reject);
    s.unref(); // the server alone never keeps the program running
    s.listen(0, "127.0.0.1", () => resolve({ server: s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }));
  });
  return server;
}

/** A fresh folder for one render job. `url(name)` gives the web address of a file in it. */
export async function makeJobFolder(): Promise<{ dir: string; url: (name: string) => string; remove: () => Promise<void> }> {
  await mkdir(ROOT, { recursive: true });
  const dir = await mkdtemp(path.join(ROOT, "job-"));
  const { base } = await getServer();
  const folder = path.basename(dir);
  return {
    dir,
    url: (name) => `${base}/${folder}/${encodeURIComponent(name)}`,
    remove: () => rm(dir, { recursive: true, force: true }),
  };
}

const browserExecutable = () => process.env.REMOTION_BROWSER || null;

/** Render the full video to `outFile` (.mp4, H.264 + AAC: works on every platform). */
/**
 * Remotion fills any prop we leave out from the example props in Root.tsx.
 * So optional props always get a value here ("" = none), never "left out".
 */
function withDefaults<T extends { brandTag?: string }>(props: T): Record<string, unknown> {
  // Remotion fills missing props from Root.tsx's examples, so send every optional prop.
  const extra = "scenes" in props ? { ctaStartMs: (props as { ctaStartMs?: number | null }).ctaStartMs ?? null } : {};
  return { ...props, brandTag: props.brandTag ?? "", ...extra } as unknown as Record<string, unknown>;
}

export async function renderVideo(props: VideoProps, outFile: string, onProgress?: (p: number) => void) {
  const serveUrl = await getBundle();
  const inputProps = withDefaults(props);
  const composition = await selectComposition({ serveUrl, id: "Video", inputProps, browserExecutable: browserExecutable() });
  let lastShown = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outFile,
    browserExecutable: browserExecutable(),
    concurrency: process.env.RENDER_CONCURRENCY ? Number(process.env.RENDER_CONCURRENCY) : null,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== lastShown) {
        lastShown = pct;
        onProgress?.(progress);
      }
    },
  });
}

/** STYLE V2 sample: render the new-style video (not used by the pipeline yet). */
export async function renderVideoV2(props: V2Props, outFile: string) {
  const serveUrl = await getBundle();
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "VideoV2", inputProps, browserExecutable: browserExecutable() });
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outFile,
    browserExecutable: browserExecutable(),
    concurrency: process.env.RENDER_CONCURRENCY ? Number(process.env.RENDER_CONCURRENCY) : null,
  });
}

/** Render the thumbnail to `outFile` (.jpg). */
export async function renderThumbnail(props: ThumbnailProps, outFile: string) {
  const serveUrl = await getBundle();
  const inputProps = withDefaults(props);
  const composition = await selectComposition({ serveUrl, id: "Thumbnail", inputProps, browserExecutable: browserExecutable() });
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    output: outFile,
    imageFormat: "jpeg",
    jpegQuality: 90,
    browserExecutable: browserExecutable(),
  });
}

/** Stop the local web server (call at the end, so the program can exit). */
export async function closeRenderer() {
  if (!server) return;
  const { server: s } = await server;
  await new Promise((r) => s.close(r));
  server = undefined;
}
