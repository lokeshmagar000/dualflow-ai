/**
 * Shapes shared by every uploader (YouTube, Facebook, Instagram, TikTok).
 */
export type PlatformName = "youtube" | "facebook" | "instagram" | "tiktok";
export type Lang = "ne" | "en";

/** One finished video, ready to upload to one channel. */
export interface UploadInput {
  language: Lang;
  format: "SHORT" | "LONG";
  /** The video file's bytes. */
  video: Buffer;
  /** "video/mp4" (default) or "video/quicktime" for .mov files from the bulk upload page. */
  mimeType?: string;
  /** The thumbnail .jpg (optional; only some platforms use it). */
  thumbnail?: Buffer | null;
  title: string;
  description: string;
  hashtags: string[];
  durationSec?: number | null;
}

export interface UploadResult {
  /** The id the platform gave the post. */
  postId: string;
  /** A link to the post, when the platform tells us one. */
  url?: string | null;
  /** Extra notes for the log (for example "uploaded as private"). */
  note?: string;
}

/** What "check my channel" found: the account name, without showing any token. */
export interface ChannelCheck {
  ok: boolean;
  name?: string;
  message: string;
}

/** One uploader for one platform and one language. */
export interface Uploader {
  platform: PlatformName;
  language: Lang;
  /** Ask the platform who this token belongs to (safe, uploads nothing). */
  check(): Promise<ChannelCheck>;
  upload(input: UploadInput): Promise<UploadResult>;
}
