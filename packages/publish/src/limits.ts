/**
 * Each platform's size and length rules, in ONE place.
 *
 * The bulk upload page checks them in your browser before sending anything,
 * the API checks them again, and the worker checks once more just before uploading.
 * So a video that a platform would refuse is stopped early, with a clear reason,
 * and the other platforms still get it.
 *
 * This file has no imports on purpose: it also runs in the browser.
 * Platforms change their rules sometimes. If an upload fails with a "too long"
 * or "too big" message, update the numbers here.
 */
import type { PlatformName } from "./types";
export type { PlatformName };

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** What we know about the video file. Width/height/duration come from the browser. */
export interface VideoFacts {
  sizeBytes: number;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface LimitResult {
  /** false = this platform will refuse the video, so we skip it. */
  ok: boolean;
  /** Reasons it cannot go (shown in red). */
  problems: string[];
  /** Things worth knowing that do not stop the upload (shown in grey). */
  notes: string[];
}

/** The rules we check. Shown on the page too, so you can see them. */
export const LIMITS = {
  /** Biggest file the bulk page accepts at all (keeps the free 10 GB R2 storage safe). */
  pageMaxBytes: 1 * GB,
  /** A "Short" is at most 3 minutes and not wider than it is tall. */
  shortMaxSec: 180,
  youtube: { maxBytes: 256 * GB, maxSec: 12 * 3600, unverifiedMaxSec: 15 * 60 },
  // Reels: 3 to 90 seconds. Longer videos go up as a normal Page video (one request: 1 GB, 20 min).
  facebook: { minSec: 3, reelMaxSec: 90, maxBytes: 1 * GB, maxSec: 20 * 60 },
  // Instagram API Reels: 3 s to 15 min, at most 300 MB.
  instagram: { minSec: 3, maxSec: 15 * 60, maxBytes: 300 * MB },
  // TikTok: up to 4 GB. Most accounts may post up to 10 minutes (TikTok tells us the exact number when uploading).
  tiktok: { minSec: 3, maxSec: 10 * 60, maxBytes: 4 * GB },
} as const;

/** "1.2 GB", "35 MB" */
export function niceSize(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / MB))} MB`;
}

/** "45 s", "3 min", "1 min 30 s" */
export function niceDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/** Short (vertical, up to 3 min) or Long. Unknown size counts as vertical. */
export function pickFormat(v: Pick<VideoFacts, "durationSec" | "width" | "height">): "SHORT" | "LONG" {
  const vertical = !v.width || !v.height || v.height >= v.width;
  const shortEnough = v.durationSec == null || v.durationSec <= LIMITS.shortMaxSec;
  return vertical && shortEnough ? "SHORT" : "LONG";
}

/** Should Facebook get it as a Reel (true) or a normal Page video (false)? */
export function facebookAsReel(format: "SHORT" | "LONG", durationSec?: number | null): boolean {
  return format === "SHORT" && (durationSec == null || durationSec <= LIMITS.facebook.reelMaxSec);
}

/** Check one video against one platform's rules. */
export function checkLimits(platform: PlatformName, v: VideoFacts): LimitResult {
  const problems: string[] = [];
  const notes: string[] = [];
  const d = v.durationSec ?? null;
  const vertical = !v.width || !v.height || v.height >= v.width;
  const tooBig = (max: number) => {
    if (v.sizeBytes > max) problems.push(`File is ${niceSize(v.sizeBytes)}; the limit is ${niceSize(max)}.`);
  };
  const tooShort = (min: number) => {
    if (d != null && d < min) problems.push(`Video is ${niceDuration(d)}; it must be at least ${min} s.`);
  };
  const tooLong = (max: number, extra = "") => {
    if (d != null && d > max) problems.push(`Video is ${niceDuration(d)}; the limit is ${niceDuration(max)}${extra}.`);
  };

  switch (platform) {
    case "youtube": {
      tooBig(LIMITS.youtube.maxBytes);
      tooLong(LIMITS.youtube.maxSec);
      if (d != null && d > LIMITS.youtube.unverifiedMaxSec) {
        notes.push("Longer than 15 min: the YouTube channel must be phone-verified.");
      }
      notes.push(pickFormat(v) === "SHORT" ? "Goes up as a YouTube Short." : "Goes up as a normal YouTube video.");
      break;
    }
    case "facebook": {
      tooShort(LIMITS.facebook.minSec);
      const reel = facebookAsReel(pickFormat(v), d);
      if (reel) {
        notes.push("Goes up as a Facebook Reel.");
      } else {
        tooBig(LIMITS.facebook.maxBytes);
        tooLong(LIMITS.facebook.maxSec);
        notes.push("Goes up as a normal Facebook Page video (Reels must be vertical and at most 90 s).");
      }
      break;
    }
    case "instagram": {
      tooShort(LIMITS.instagram.minSec);
      tooLong(LIMITS.instagram.maxSec);
      tooBig(LIMITS.instagram.maxBytes);
      if (!vertical) notes.push("Not vertical: Instagram shows it as a Reel with empty space above and below.");
      break;
    }
    case "tiktok": {
      tooShort(LIMITS.tiktok.minSec);
      tooLong(LIMITS.tiktok.maxSec, " for most accounts");
      tooBig(LIMITS.tiktok.maxBytes);
      if (!vertical) notes.push("Not vertical: TikTok works best with 9:16 videos.");
      break;
    }
  }
  return { ok: problems.length === 0, problems, notes };
}
