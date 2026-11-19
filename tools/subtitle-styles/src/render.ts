/**
 * Make the previews: for each of the 5 styles, in English and Nepali,
 *   - one still picture (.jpg) at the real Shorts size (1080 x 1920),
 *   - one 3 second clip (.mp4) and a small animated .gif,
 *   - plus one sheet per language with all 5 styles side by side.
 *
 * Run:  npm run render            (output goes to ./out)
 * Settings (all optional):
 *   PIXABAY_API_KEY  free key; downloads a real stock clip for the background
 *   BG_FILE          your own background video instead
 *   BG_QUERY         what clip to search on Pixabay (default "kathmandu")
 *   REMOTION_BROWSER path to Chrome (Remotion downloads one if empty)
 *   OUT              output folder
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { STYLES, type Lang, type StyleId } from "./styles";
import type { PreviewProps } from "./Root";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC = path.join(ROOT, "work/public");
const OUT = path.resolve(process.env.OUT || path.join(ROOT, "out"));
const browserExecutable = process.env.REMOTION_BROWSER || null;

/** Which frame to use for the still picture (30 frames = 1 second). */
const STILL_FRAME: Record<StyleId, number> = {
  "1-word-pop": 36, // "क्षेत्र" / "sector" is the active word here
  "2-karaoke": 40, // half of the line is lit
  "3-neon-glow": 80, // 3 words have glowed in
  "4-boxed-caption": 42,
  "5-typewriter": 86, // nearly finished typing
};

const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

/** Get a background clip: your file, or a free Pixabay clip, or none (colour gradient). */
async function background(): Promise<boolean> {
  mkdirSync(PUBLIC, { recursive: true });
  const raw = path.join(ROOT, "work/raw.mp4");
  if (process.env.BG_FILE) {
    copyFileSync(process.env.BG_FILE, raw);
  } else if (process.env.PIXABAY_API_KEY) {
    const q = encodeURIComponent(process.env.BG_QUERY || "kathmandu");
    const res = await fetch(`https://pixabay.com/api/videos/?key=${process.env.PIXABAY_API_KEY}&q=${q}&safesearch=true&per_page=20`);
    if (!res.ok) throw new Error(`Pixabay error ${res.status}`);
    type Size = { url: string; width: number; height: number };
    const { hits } = (await res.json()) as { hits: { id: number; pageURL: string; videos: Record<string, Size> }[] };
    // Prefer a clip that is at least 1080 px tall, not too big to download.
    const pick = hits
      .map((h) => ({ h, s: Object.values(h.videos).filter((v) => v.url && v.height >= 1080).sort((a, b) => a.height - b.height)[0] }))
      .find((x) => x.s);
    if (!pick) throw new Error("No Pixabay clip found");
    console.log(`Background: Pixabay video ${pick.h.id} (${pick.h.pageURL})`);
    const file = await fetch(pick.s!.url);
    writeFileSync(raw, Buffer.from(await file.arrayBuffer()));
  } else {
    console.log("Background: colour gradient (no PIXABAY_API_KEY or BG_FILE)");
    return false;
  }
  // Cut 3 seconds and crop to the tall Shorts shape (1080 x 1920), no sound.
  ffmpeg(["-ss", "1", "-i", raw, "-t", "3.2", "-an", "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", path.join(PUBLIC, "bg.mp4")]);
  return true;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  for (const d of ["stills", "clips", "gifs"]) mkdirSync(path.join(OUT, d), { recursive: true });

  const hasBg = await background();
  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.join(HERE, "index.ts"), publicDir: PUBLIC });

  for (const lang of ["en", "ne"] as Lang[]) {
    for (const s of STYLES) {
      const inputProps: PreviewProps = { style: s.id, lang, background: hasBg };
      const composition = await selectComposition({ serveUrl, id: "Preview", inputProps, browserExecutable });
      const name = `${s.id}-${lang}`;
      console.log(`Rendering ${name}…`);
      await renderStill({
        composition, serveUrl, inputProps, browserExecutable,
        frame: STILL_FRAME[s.id],
        imageFormat: "jpeg",
        jpegQuality: 90,
        output: path.join(OUT, "stills", `${name}.jpg`),
      });
      const clip = path.join(OUT, "clips", `${name}.mp4`);
      await renderMedia({ composition, serveUrl, inputProps, browserExecutable, codec: "h264", crf: 20, outputLocation: clip, muted: true });
      // Small GIF (360 px wide) that plays in any chat app.
      ffmpeg(["-i", clip, "-vf", "fps=15,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", path.join(OUT, "gifs", `${name}.gif`)]);
    }
    // One sheet with all 5 styles side by side (each picture made smaller).
    const inputs = STYLES.flatMap((s) => ["-i", path.join(OUT, "stills", `${s.id}-${lang}.jpg`)]);
    const scaled = STYLES.map((_, i) => `[${i}]scale=540:960,pad=560:980:10:10:color=0x111111[v${i}]`).join(";");
    const stack = STYLES.map((_, i) => `[v${i}]`).join("") + `hstack=inputs=${STYLES.length}`;
    ffmpeg([...inputs, "-filter_complex", `${scaled};${stack}`, "-q:v", "3", path.join(OUT, `sheet-${lang}.jpg`)]);
  }
  if (!existsSync(path.join(OUT, "sheet-ne.jpg"))) throw new Error("Sheets missing");
  console.log(`Done: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
