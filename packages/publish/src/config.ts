/**
 * Publishing settings. Everything comes from environment variables, which
 * GitHub Actions fills from your Secrets and Variables. Tokens are NEVER in the code.
 *
 * Main switches (GitHub "Variables"):
 *   PUBLISH_ENABLED   "true" to upload at all (default false = nothing is uploaded)
 *   PUBLISH_DRY_RUN   "true" = practice: check tokens and print what WOULD be uploaded,
 *                     but upload nothing and change nothing (default true, to be safe)
 *   PUBLISH_MODE      auto | approval | manual   (default approval)
 *                       auto     = every finished video is put in the queue by itself
 *                       approval = it waits until you press "Approve" in the dashboard
 *                       manual   = nothing happens until you press "Upload now"
 *   PUBLISH_MODE_<PLATFORM>  the same, for one platform only (e.g. PUBLISH_MODE_TIKTOK=manual)
 *   PUBLISH_PLATFORMS  which platforms to use, e.g. "youtube,facebook" (default: all that have tokens)
 *   PUBLISH_TIMES      upload times, e.g. "07:00,12:30,19:00" (default)
 *   PUBLISH_TIMEZONE   the clock those times are in (default Asia/Kathmandu)
 *
 * One channel per language. Tokens (GitHub "Secrets"), with _NE for Nepali and _EN for English:
 *   YouTube:   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET (shared), YOUTUBE_REFRESH_TOKEN_NE / _EN
 *   Facebook:  FACEBOOK_PAGE_ID_NE / _EN, FACEBOOK_PAGE_TOKEN_NE / _EN
 *   Instagram: INSTAGRAM_USER_ID_NE / _EN (uses the Facebook page token of the same language,
 *              or INSTAGRAM_TOKEN_NE / _EN if you set one)
 *   TikTok:    TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET (shared), TIKTOK_REFRESH_TOKEN_NE / _EN
 */
import type { Lang, PlatformName } from "./types";

export const PLATFORMS: PlatformName[] = ["youtube", "facebook", "instagram", "tiktok"];
export const LANGS: Lang[] = ["ne", "en"];
export type Mode = "auto" | "approval" | "manual";

type Env = Record<string, string | undefined>;

const flag = (v: string | undefined, fallback: boolean) =>
  v === undefined || v.trim() === "" ? fallback : ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());

export function publishEnabled(env: Env = process.env): boolean {
  return flag(env.PUBLISH_ENABLED, false);
}

export function dryRun(env: Env = process.env): boolean {
  return flag(env.PUBLISH_DRY_RUN, true);
}

export function modeFor(platform: PlatformName, env: Env = process.env): Mode {
  const raw = (env[`PUBLISH_MODE_${platform.toUpperCase()}`] || env.PUBLISH_MODE || "approval").trim().toLowerCase();
  if (raw === "auto" || raw === "approval" || raw === "manual") return raw;
  return "approval";
}

/** Read one setting for one language, e.g. key("FACEBOOK_PAGE_ID", "ne") -> FACEBOOK_PAGE_ID_NE. */
export function langSetting(name: string, lang: Lang, env: Env = process.env): string | undefined {
  const v = env[`${name}_${lang.toUpperCase()}`]?.trim();
  return v ? v : undefined;
}

/** The settings each platform needs for one language. Missing ones are listed by name. */
export function requiredSettings(platform: PlatformName, lang: Lang): string[] {
  const L = lang.toUpperCase();
  switch (platform) {
    case "youtube":
      return ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", `YOUTUBE_REFRESH_TOKEN_${L}`];
    case "facebook":
      return [`FACEBOOK_PAGE_ID_${L}`, `FACEBOOK_PAGE_TOKEN_${L}`];
    case "instagram":
      return [`INSTAGRAM_USER_ID_${L}`];
    case "tiktok":
      return ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", `TIKTOK_REFRESH_TOKEN_${L}`];
  }
}

export function missingSettings(platform: PlatformName, lang: Lang, env: Env = process.env): string[] {
  const missing = requiredSettings(platform, lang).filter((k) => !env[k]?.trim());
  // Instagram also needs a token: its own, or the Facebook page token of the same language.
  if (platform === "instagram" && !langSetting("INSTAGRAM_TOKEN", lang, env) && !langSetting("FACEBOOK_PAGE_TOKEN", lang, env)) {
    missing.push(`INSTAGRAM_TOKEN_${lang.toUpperCase()} or FACEBOOK_PAGE_TOKEN_${lang.toUpperCase()}`);
  }
  return missing;
}

/** Platforms you turned on with PUBLISH_PLATFORMS (default: all four). */
export function chosenPlatforms(env: Env = process.env): PlatformName[] {
  const raw = env.PUBLISH_PLATFORMS?.trim();
  if (!raw || raw.toLowerCase() === "all") return PLATFORMS;
  const picked = raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
  return PLATFORMS.filter((p) => picked.includes(p));
}

export interface ChannelConfig {
  platform: PlatformName;
  language: Lang;
  mode: Mode;
  /** A friendly name, e.g. "YouTube (Nepali)". Change with CHANNEL_LABEL_YOUTUBE_NE. */
  label: string;
}

const NICE: Record<PlatformName, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const LANG_NAME: Record<Lang, string> = { ne: "Nepali", en: "English" };

/** Every channel that is turned on AND has all its settings. */
export function configuredChannels(env: Env = process.env): ChannelConfig[] {
  const out: ChannelConfig[] = [];
  for (const platform of chosenPlatforms(env)) {
    for (const language of LANGS) {
      if (missingSettings(platform, language, env).length > 0) continue;
      out.push({
        platform,
        language,
        mode: modeFor(platform, env),
        label: env[`CHANNEL_LABEL_${platform.toUpperCase()}_${language.toUpperCase()}`]?.trim() || `${NICE[platform]} (${LANG_NAME[language]})`,
      });
    }
  }
  return out;
}

export function platformLabel(p: PlatformName) {
  return NICE[p];
}
