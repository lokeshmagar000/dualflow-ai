/**
 * Shared types and validation used by web, api and worker.
 * Keeping them in one place means every app agrees on the same shapes.
 */
import { z } from "zod";

/** The two languages every Story is produced in. */
export const LANGUAGES = ["ne", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  ne: "नेपाली",
  en: "English",
};

export const VIDEO_FORMATS = ["short", "long"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

/** Publishing modes, chosen per channel. */
export const PUBLISH_MODES = ["auto", "approval", "manual"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

/** Names of the background jobs. Each pipeline step is its own job. */
export const QUEUE_NAME = "pipeline";
export const JOB_NAMES = {
  research: "research",
  script: "script",
  voice: "voice",
  thumbnail: "thumbnail",
  render: "render",
  publish: "publish",
} as const;
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/** Data carried by a pipeline job. Small on purpose: workers load the rest from the DB. */
export interface PipelineJobData {
  storyId: string;
  /** Present for steps that run once per language (script, voice, render...). */
  variantId?: string;
  /** Which run of the pipeline this is (goes up by one on every retry). */
  run?: number;
}

/* ---------- Request validation (zod) ---------- */

export const createTopicSchema = z.object({
  title: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(["chat", "trend", "director", "manual"]).default("manual"),
});
export type CreateTopicInput = z.infer<typeof createTopicSchema>;

export const createStorySchema = z.object({
  topicId: z.string().min(1),
  format: z.enum(VIDEO_FORMATS).default("short"),
});
export type CreateStoryInput = z.infer<typeof createStorySchema>;

export { BRAND_COLORS, brandFor, type Brand } from "./brand";

/**
 * Thumbnail sizes (one per kind of platform). The main thumbnail is "thumbnail.jpg";
 * each extra size is saved next to it as "thumbnail-<size>.jpg".
 */
export const THUMBNAIL_SIZE_NAMES = ["shorts", "youtube", "feed"] as const;
export type ThumbnailSizeName = (typeof THUMBNAIL_SIZE_NAMES)[number];
export const THUMBNAIL_SIZE_LABELS: Record<ThumbnailSizeName, string> = {
  shorts: "Shorts / TikTok / Reels (1080x1920)",
  youtube: "YouTube (1280x720)",
  feed: "Facebook / Instagram post (1080x1350)",
};
export function thumbnailKeyFor(mainKey: string, size: ThumbnailSizeName): string {
  return mainKey.replace(/thumbnail\.jpg$/, `thumbnail-${size}.jpg`);
}

/**
 * Which video style to make (VIDEO_STYLE setting):
 *   "v2" (default)  hook on frame 1, no logo intro, loop ending, music + sound effects,
 *                   key-word stickers, number cards, strict picture check
 *   "classic"       the older style: logo intro, title box, like & follow card at the end
 */
export type VideoStyleName = "v2" | "classic";
export function videoStyle(
  env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {},
): VideoStyleName {
  return (env.VIDEO_STYLE ?? "").toLowerCase() === "classic" ? "classic" : "v2";
}

export * from "./politics";
export * from "./ai-choice";
