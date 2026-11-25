/**
 * @dualflow/publish: uploads finished videos to YouTube, Facebook, Instagram and TikTok.
 * The worker decides WHEN (modes, queue, retries); this package only does the uploading.
 */
import type { Lang, PlatformName, Uploader } from "./types";
import { youtubeUploader } from "./youtube";
import { facebookUploader, instagramUploader } from "./meta";
import { tiktokUploader } from "./tiktok";
import { uploadPostUploader, viaUploadPost } from "./uploadpost";

export * from "./types";
export * from "./errors";
export * from "./config";
export * from "./schedule";
export * from "./limits";
export * from "./secret-box";
export * from "./connections";
export * from "./oauth";
export * from "./uploadpost";
export { chunkPlan, choosePrivacy, tiktokCreator, tiktokDefaultCaption } from "./tiktok";

export function getUploader(platform: PlatformName, language: Lang, env: Record<string, string | undefined> = process.env): Uploader {
  // Upload-Post has an account for this platform + language: post through it (no developer app needed).
  if (viaUploadPost(platform, language, env)) return uploadPostUploader(platform, language, env);
  switch (platform) {
    case "youtube":
      return youtubeUploader(language, env);
    case "facebook":
      return facebookUploader(language, env);
    case "instagram":
      return instagramUploader(language, env);
    case "tiktok":
      return tiktokUploader(language, env);
  }
}
