/**
 * Channels connected with the dashboard's one-click "Connect" buttons.
 *
 * The uploaders read their settings from environment variables (YOUTUBE_REFRESH_TOKEN_NE, ...).
 * Instead of changing every uploader, we turn what the dashboard saved in the database into
 * those SAME names ("overlay") and lay them over process.env. So a channel works the same
 * whether its token came from a GitHub Secret (the old way) or from a Connect button (the new way).
 * When both exist, the dashboard wins: it is the newest thing you did.
 *
 * The same goes for the "Auto upload" switch on the Channels page: when you have used it, it
 * replaces the GitHub variables PUBLISH_ENABLED, PUBLISH_DRY_RUN and PUBLISH_MODE.
 */
import { unlockSecret } from "./secret-box";
import type { Lang } from "./types";

type Env = Record<string, string | undefined>;

export type DbPlatform = "YOUTUBE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK";

export interface StoredSetting {
  key: string;
  value: string;
}
export interface StoredChannel {
  platform: DbPlatform;
  language: Lang;
  externalId: string | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
}

/** The "Auto upload" switch on the Channels page. */
export type UploadSwitch = "off" | "practice" | "approval" | "auto";
export const UPLOAD_SWITCHES: UploadSwitch[] = ["off", "practice", "approval", "auto"];

/** Setting keys in the AppSetting table. */
export const SETTING = {
  youtubeApp: "app.youtube", // locked JSON { id, secret }
  metaApp: "app.meta", // locked JSON { id, secret, configId? }
  tiktokApp: "app.tiktok", // locked JSON { id, secret }
  uploadSwitch: "publish.switch", // plain JSON { mode: UploadSwitch }
} as const;

export interface AppKeys {
  id: string;
  secret: string;
  /** Meta only: a "Facebook Login for Business" configuration id, if your app uses one. */
  configId?: string;
}

export function readAppKeys(value: string | undefined, env: Env = process.env): AppKeys | null {
  if (!value) return null;
  const parsed = JSON.parse(unlockSecret(value, env)) as AppKeys;
  return parsed.id && parsed.secret ? parsed : null;
}

export function readSwitch(value: string | undefined): UploadSwitch | null {
  if (!value) return null;
  try {
    const mode = (JSON.parse(value) as { mode?: string }).mode;
    return UPLOAD_SWITCHES.includes(mode as UploadSwitch) ? (mode as UploadSwitch) : null;
  } catch {
    return null;
  }
}

/** What each switch position means for the old GitHub variables. */
export function switchToEnv(mode: UploadSwitch): Env {
  switch (mode) {
    case "off":
      return { PUBLISH_ENABLED: "false" };
    case "practice":
      return { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "true", PUBLISH_MODE: "auto" };
    case "approval":
      return { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_MODE: "approval" };
    case "auto":
      return { PUBLISH_ENABLED: "true", PUBLISH_DRY_RUN: "false", PUBLISH_MODE: "auto" };
  }
}

/**
 * Turn saved settings and connected channels into environment variable names.
 * A value that cannot be unlocked is skipped and explained in `problems` (the run goes on).
 */
export function connectionsToEnv(settings: StoredSetting[], channels: StoredChannel[], env: Env = process.env): { overlay: Env; problems: string[] } {
  const overlay: Env = {};
  const problems: string[] = [];
  const byKey = new Map(settings.map((s) => [s.key, s.value]));
  const tryRead = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      const msg = `${what}: ${(err as Error).message}`;
      if (!problems.includes(msg)) problems.push(msg);
    }
  };

  tryRead("YouTube app keys", () => {
    const k = readAppKeys(byKey.get(SETTING.youtubeApp), env);
    if (k) Object.assign(overlay, { YOUTUBE_CLIENT_ID: k.id, YOUTUBE_CLIENT_SECRET: k.secret });
  });
  tryRead("TikTok app keys", () => {
    const k = readAppKeys(byKey.get(SETTING.tiktokApp), env);
    if (k) Object.assign(overlay, { TIKTOK_CLIENT_KEY: k.id, TIKTOK_CLIENT_SECRET: k.secret });
  });

  for (const ch of channels) {
    const L = ch.language.toUpperCase();
    tryRead(`${ch.platform} ${L}`, () => {
      switch (ch.platform) {
        case "YOUTUBE":
          if (ch.refreshTokenEnc) overlay[`YOUTUBE_REFRESH_TOKEN_${L}`] = unlockSecret(ch.refreshTokenEnc, env);
          break;
        case "TIKTOK":
          if (ch.refreshTokenEnc) overlay[`TIKTOK_REFRESH_TOKEN_${L}`] = unlockSecret(ch.refreshTokenEnc, env);
          break;
        case "FACEBOOK":
          if (ch.accessTokenEnc && ch.externalId) {
            overlay[`FACEBOOK_PAGE_TOKEN_${L}`] = unlockSecret(ch.accessTokenEnc, env);
            overlay[`FACEBOOK_PAGE_ID_${L}`] = ch.externalId;
          }
          break;
        case "INSTAGRAM":
          if (ch.accessTokenEnc && ch.externalId) {
            overlay[`INSTAGRAM_TOKEN_${L}`] = unlockSecret(ch.accessTokenEnc, env);
            overlay[`INSTAGRAM_USER_ID_${L}`] = ch.externalId;
          }
          break;
      }
    });
  }

  const mode = readSwitch(byKey.get(SETTING.uploadSwitch));
  if (mode) Object.assign(overlay, switchToEnv(mode));
  return { overlay, problems };
}

/* ---------- TikTok gives a NEW refresh token now and then ---------- */

type Saver = (platform: "tiktok", language: Lang, refreshToken: string) => Promise<void>;
let saver: Saver | null = null;

/** The worker registers this so a new TikTok refresh token is saved in the database by itself. */
export function setRefreshTokenSaver(fn: Saver | null) {
  saver = fn;
}

/** Called by the TikTok uploader. Returns true when the new token was saved. */
export async function saveNewRefreshToken(platform: "tiktok", language: Lang, token: string): Promise<boolean> {
  if (!saver) return false;
  try {
    await saver(platform, language, token);
    return true;
  } catch (err) {
    console.log(`::warning::Could not save the new ${platform} token: ${(err as Error).message}`);
    return false;
  }
}
