/**
 * What the video maker needs to know. Everything is plain data (JSON),
 * because Remotion sends it into a web page that draws the video.
 *
 * Files (audioFile, media.src) are web addresses. While rendering, render.ts runs
 * a tiny local web server for the job folder, so they look like
 * http://127.0.0.1:PORT/job-123/voice.wav
 */
export type VideoFormat = "SHORT" | "LONG";

export type Media = {
  src: string;
  kind: "video" | "image";
  /** For clips in a thumbnail: which second of the clip to show (default 0). */
  atSec?: number;
};

export type VideoScene = {
  startMs: number;
  endMs: number;
  text: string;
  media?: Media | null;
};

/** One spoken word and when it is said (from the voice step). Word Pop subtitles use these. */
export type VideoWord = {
  startMs: number;
  endMs: number;
  text: string;
};

/**
 * The short animated intro at the very start (channel name + optional tagline + sound).
 * The voice starts right after it, so nothing in the story is cut.
 */
export type IntroProps = {
  /** Big text, e.g. the channel name. */
  text: string;
  /** Small red label after the name, e.g. "नेपाली" (optional). */
  tag?: string;
  /** Small line under it (optional), e.g. "Daily facts". */
  tagline?: string;
  /** How long the intro lasts, in milliseconds (about 2000). */
  durationMs: number;
  /** Web address of the intro sound, or null for a silent intro. */
  soundFile?: string | null;
};

/** "word-pop": big words, the spoken one turns yellow (default). "classic": one full line. */
export type SubtitleStyle = "word-pop" | "classic";

/** One subtitle line on screen. */
export type VideoCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type VideoProps = {
  format: VideoFormat;
  language: "ne" | "en";
  title: string;
  audioFile: string;
  durationMs: number;
  scenes: VideoScene[];
  cues: VideoCue[];
  /** Word timings for Word Pop subtitles. If empty, words are spread evenly over each cue. */
  words?: VideoWord[];
  subtitleStyle?: SubtitleStyle;
  /** The animated intro, or null/missing for no intro. */
  intro?: IntroProps | null;
  /** Channel name in the video's language ("Namaste Facts" / "नमस्ते फ्याक्ट्स"), shown with the logo in the corner. */
  brand: string;
  /** Small red label after the channel name ("नेपाली" in Nepali videos). */
  brandTag?: string;
  /** Highlight colour for the title and progress bar (the logo's marigold by default). */
  accent: string;
};

/**
 * Thumbnail sizes, one per kind of platform:
 *   shorts   1080x1920  YouTube Shorts, TikTok, Instagram Reels, Facebook Reels cover
 *   youtube  1280x720   normal YouTube videos
 *   feed     1080x1350  Facebook and Instagram feed posts (4:5)
 */
export const THUMBNAIL_SIZES = {
  shorts: { width: 1080, height: 1920 },
  youtube: { width: 1280, height: 720 },
  feed: { width: 1080, height: 1350 },
} as const;
export type ThumbnailSize = keyof typeof THUMBNAIL_SIZES;

export type ThumbnailProps = {
  format: VideoFormat;
  /** Which size to draw. Leave out to use the video's own shape (shorts or youtube). */
  size?: ThumbnailSize;
  language: "ne" | "en";
  headline: string;
  media?: Media | null;
  /** Channel name ("Namaste Facts"). */
  brand: string;
  /** Small red label after the name ("नेपाली" for the Nepali channel). */
  brandTag?: string;
  accent: string;
};

export const FPS = 30;

/** The story starts this much before the intro ends, while the intro fades away. */
export const INTRO_OVERLAP_MS = 300;

/** Length of the intro in frames (0 = no intro). */
export function introFrames(props: Pick<VideoProps, "intro">): number {
  const ms = props.intro?.durationMs ?? 0;
  return ms > 0 ? Math.round((ms / 1000) * FPS) : 0;
}

/** The frame where the story (voice, pictures, subtitles) starts. */
export function storyStartFrame(props: Pick<VideoProps, "intro">): number {
  const intro = introFrames(props);
  return intro ? Math.max(0, intro - Math.round((INTRO_OVERLAP_MS / 1000) * FPS)) : 0;
}

/** Frames of the story part: the voice plus half a second of quiet at the end. */
export function storyFrames(props: Pick<VideoProps, "durationMs">): number {
  return Math.max(1, Math.ceil(((props.durationMs + 500) / 1000) * FPS));
}

/** Size in pixels: Shorts are tall (phone), long videos are wide (TV). */
export function sizeFor(format: VideoFormat) {
  return format === "SHORT" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/** The thumbnail size that matches the video's shape. */
export function mainThumbnailSize(format: VideoFormat): ThumbnailSize {
  return format === "SHORT" ? "shorts" : "youtube";
}

/** Thumbnail size in pixels (YouTube wants 1280x720 for wide videos). */
export function thumbnailSizeFor(format: VideoFormat, size?: ThumbnailSize) {
  return { ...THUMBNAIL_SIZES[size ?? mainThumbnailSize(format)] };
}
