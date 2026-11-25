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
  /** A stable id for this upload (the publication id), so a retry never posts twice (Upload-Post). */
  requestKey?: string;
  /** TikTok only: the choices made in the dashboard's TikTok upload window. */
  tiktok?: TikTokPostOptions | null;
}

/**
 * What the owner picked in the TikTok upload window (TikTok's rules for "Direct Post"
 * apps: no privacy is picked for you, the caption can be edited, and comments,
 * duet and stitch can each be turned off).
 */
export interface TikTokPostOptions {
  /** One of creator_info's privacy_level_options, e.g. PUBLIC_TO_EVERYONE or SELF_ONLY. */
  privacyLevel: string;
  caption: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** "Your brand": you promote yourself or your own business. */
  brandOrganic?: boolean;
  /** "Branded content": a paid partnership with another brand (cannot be private). */
  brandedContent?: boolean;
}

/** What TikTok says about the connected account, shown in the upload window. */
export interface TikTokCreator {
  username?: string;
  nickname?: string;
  avatarUrl?: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec?: number;
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
