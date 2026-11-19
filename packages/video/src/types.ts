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
};

export type VideoScene = {
  startMs: number;
  endMs: number;
  text: string;
  media?: Media | null;
};

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
  /** Small name in the corner, e.g. the channel name. */
  brand: string;
  /** Highlight colour for the title and progress bar. */
  accent: string;
};

export type ThumbnailProps = {
  format: VideoFormat;
  language: "ne" | "en";
  headline: string;
  media?: Media | null;
  brand: string;
  accent: string;
};

export const FPS = 30;

/** Size in pixels: Shorts are tall (phone), long videos are wide (TV). */
export function sizeFor(format: VideoFormat) {
  return format === "SHORT" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/** Thumbnail size: YouTube wants 1280x720 for wide videos. */
export function thumbnailSizeFor(format: VideoFormat) {
  return format === "SHORT" ? { width: 1080, height: 1920 } : { width: 1280, height: 720 };
}
