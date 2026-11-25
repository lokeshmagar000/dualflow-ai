/**
 * Upload-Post (upload-post.com): ONE service that posts to YouTube, Instagram, TikTok and
 * Facebook for us. You connect each social account once on Upload-Post's own page, so there
 * are no Google / Meta / TikTok developer apps to set up and no app reviews to wait for.
 *
 * How it fits in:
 *   - Upload-Post has "profiles". We use two: one for English, one for Nepali.
 *     Each profile has its own connected accounts (YouTube + Instagram + TikTok + Facebook).
 *   - The dashboard saves the API key (locked) and the two profile names. The worker turns
 *     them into the settings below (see connections.ts), like every other channel.
 *   - When Upload-Post has an account for a platform + language, getUploader() uses this
 *     uploader. Otherwise the old direct uploader (youtube.ts, meta.ts, tiktok.ts) is used.
 *
 * Settings (environment variables, or filled in by the dashboard):
 *   UPLOAD_POST_API_KEY            the API key from upload-post.com → API Keys
 *   UPLOAD_POST_USER_NE / _EN      the profile name for each language (e.g. namaste-facts-ne)
 *   UPLOAD_POST_PLATFORMS_NE / _EN which accounts are connected there, e.g. "youtube,instagram"
 *   UPLOAD_POST_YOUTUBE_PRIVACY    public (default) | unlisted | private
 *   UPLOAD_POST_TIKTOK_PRIVACY     PUBLIC_TO_EVERYONE (default) | SELF_ONLY | ... (Auto upload only)
 *   UPLOAD_POST_FACEBOOK_PAGE_NE / _EN  which Facebook Page to use, if the account has several
 *
 * API: https://docs.upload-post.com (base https://api.upload-post.com/api,
 * header "Authorization: Apikey <key>", POST /upload as multipart form data).
 */
import { PublishConfigError, PublishQuotaError } from "./errors";
import { cut, http, readJson } from "./http";
import type { ChannelCheck, Lang, PlatformName, UploadInput, UploadResult, Uploader } from "./types";

type Env = Record<string, string | undefined>;

export const UPLOAD_POST_PLATFORMS: PlatformName[] = ["youtube", "instagram", "tiktok", "facebook"];
/** The profile names the dashboard makes for you, if you do not type your own. */
export const UPLOAD_POST_DEFAULT_USERS: Record<Lang, string> = { en: "namaste-facts-en", ne: "namaste-facts-ne" };
const NICE: Record<PlatformName, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const MINUTE = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function base(env: Env) {
  return (env.UPLOAD_POST_BASE_URL?.trim() || "https://api.upload-post.com/api").replace(/\/+$/, "");
}

/** The saved Upload-Post setup for one language, or null when it is not complete. */
export function uploadPostSetup(lang: Lang, env: Env = process.env): { apiKey: string; user: string; platforms: PlatformName[] } | null {
  const apiKey = env.UPLOAD_POST_API_KEY?.trim();
  const user = env[`UPLOAD_POST_USER_${lang.toUpperCase()}`]?.trim();
  if (!apiKey || !user) return null;
  return { apiKey, user, platforms: parsePlatforms(env[`UPLOAD_POST_PLATFORMS_${lang.toUpperCase()}`]) };
}

export function parsePlatforms(raw: string | undefined): PlatformName[] {
  const picked = (raw ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  return UPLOAD_POST_PLATFORMS.filter((p) => picked.includes(p));
}

/** True when this platform + language should post through Upload-Post. */
export function viaUploadPost(platform: PlatformName, lang: Lang, env: Env = process.env): boolean {
  return Boolean(uploadPostSetup(lang, env)?.platforms.includes(platform));
}

/* ---------------------------- talking to Upload-Post ---------------------------- */

export class UploadPostError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "UploadPostError";
  }
}

async function call<T = any>(env: Env, apiKey: string, path: string, init: RequestInit & { timeoutSec?: number; tries?: number } = {}): Promise<T> {
  const res = await http(`${base(env)}${path}`, {
    ...init,
    headers: { authorization: `Apikey ${apiKey}`, ...(init.headers as Record<string, string> | undefined) },
  });
  const json = await readJson(res);
  if (!res.ok || json?.success === false) {
    const msg = String(json?.message || json?.detail || json?.error || json?.raw || `HTTP ${res.status}`);
    throw new UploadPostError(`Upload-Post: ${msg}`.slice(0, 400), res.status, json?.code || json?.error_code);
  }
  return json as T;
}

export interface UploadPostProfile {
  username: string;
  /** Platform -> the connected account's name (or "connected" when Upload-Post gives no name). */
  accounts: Partial<Record<PlatformName, string>>;
}

/** The name of a connected account, from whatever Upload-Post sends for it. Empty = not connected. */
function accountName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object") return "connected";
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length === 0) return null;
  if (v.connected === false || v.reauth_required === true) return null;
  const name = v.display_name ?? v.username ?? v.handle ?? v.name ?? v.title ?? v.social_username;
  return typeof name === "string" && name.trim() ? name.trim() : "connected";
}

export function readProfile(raw: any): UploadPostProfile {
  const social = (raw?.social_accounts ?? {}) as Record<string, unknown>;
  const accounts: UploadPostProfile["accounts"] = {};
  for (const p of UPLOAD_POST_PLATFORMS) {
    const name = accountName(social[p]);
    if (name) accounts[p] = name;
  }
  return { username: String(raw?.username ?? ""), accounts };
}

/** Every profile on your Upload-Post account, with the accounts connected to each. */
export async function listUploadPostProfiles(apiKey: string, env: Env = process.env): Promise<UploadPostProfile[]> {
  const json = await call<{ profiles?: unknown[] }>(env, apiKey, "/uploadposts/users");
  return (json.profiles ?? []).map(readProfile).filter((p) => p.username);
}

/** Make a new profile (the free plan allows 2). */
export async function createUploadPostProfile(apiKey: string, username: string, env: Env = process.env): Promise<void> {
  await call(env, apiKey, "/uploadposts/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
    tries: 1,
  });
}

/**
 * A link to Upload-Post's "connect your accounts" page for one profile. You sign in to
 * YouTube / Instagram / TikTok / Facebook there, then it sends you back to `redirectUrl`.
 */
export async function uploadPostConnectLink(apiKey: string, username: string, redirectUrl: string, env: Env = process.env): Promise<string> {
  const json = await call<{ access_url?: string; connection_url?: string; url?: string }>(env, apiKey, "/uploadposts/users/generate-jwt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      redirect_url: redirectUrl,
      redirect_button_text: "Back to DualFlow",
      platforms: UPLOAD_POST_PLATFORMS,
      connect_title: "Namaste Facts",
      connect_description: "Connect the accounts DualFlow should post to.",
    }),
    tries: 1,
  });
  const url = json.access_url || json.connection_url || json.url;
  if (!url) throw new UploadPostError("Upload-Post did not send a connect link.", 200);
  return url;
}

/* ---------------------------- reading an upload answer ---------------------------- */

export interface PlatformOutcome {
  state: "done" | "failed" | "pending";
  url?: string | null;
  postId?: string | null;
  error?: string;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

function outcomeFrom(r: any): PlatformOutcome {
  const error = str(r?.error) ?? str(r?.error_message) ?? (r?.success === false ? str(r?.message) ?? "failed" : null);
  const url = str(r?.url) ?? str(r?.post_url) ?? str(r?.permalink) ?? str(r?.video_url);
  const postId = str(r?.platform_post_id) ?? str(r?.post_id) ?? str(r?.video_id) ?? str(r?.media_id) ?? str(r?.publish_id) ?? str(r?.id);
  const status = String(r?.status ?? "").toLowerCase();
  if (error || ["failed", "error"].includes(status)) return { state: "failed", error: error ?? status };
  if (r?.success === true || url || postId || ["completed", "success", "published", "done"].includes(status)) return { state: "done", url, postId };
  return { state: "pending" };
}

/**
 * Find what happened on ONE platform in an Upload-Post answer. Upload-Post has sent this in
 * a few shapes over time ({ results: { tiktok: {...} } }, { data: { platforms: [...] } }, ...),
 * so we look in every place it can be.
 */
export function readOutcome(body: any, platform: PlatformName): PlatformOutcome {
  const places = [body?.results, body?.data?.results, body?.result, body?.data, body?.platforms, body?.data?.platforms];
  for (const place of places) {
    if (!place) continue;
    if (Array.isArray(place)) {
      const item = place.find((x) => String(x?.platform ?? x?.name ?? "").toLowerCase() === platform);
      if (item) return outcomeFrom(item);
    } else if (typeof place === "object" && place[platform]) {
      return outcomeFrom(place[platform]);
    }
  }
  const status = String(body?.status ?? body?.data?.status ?? "").toLowerCase();
  if (["failed", "error"].includes(status)) return { state: "failed", error: str(body?.message) ?? str(body?.error) ?? status };
  return { state: "pending" };
}

/* ---------------------------- the uploader ---------------------------- */

const hashLine = (tags: string[]) => tags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");

/** Turn an Upload-Post error into the kind the publish runner understands. */
function asPublishError(err: unknown, label: string): Error {
  if (!(err instanceof UploadPostError)) return err as Error;
  const msg = `${label}: ${err.message}`;
  const text = err.message.toLowerCase();
  // Your plan's monthly uploads are used up: wait a day and try again (not a failure).
  if (err.status === 402 || err.status === 429 || (err.status !== 401 && /\blimits?\b|quota|upgrade|\bplan\b/.test(text))) {
    return new PublishQuotaError(`${msg} (your Upload-Post plan limit; it will try again tomorrow)`, new Date(Date.now() + 24 * 60 * MINUTE));
  }
  // Wrong key, unknown profile, account not connected, a privacy TikTok does not allow: retrying cannot help.
  if ([400, 401, 403, 404, 422].includes(err.status)) return new PublishConfigError(msg);
  return new Error(msg);
}

export function uploadPostUploader(platform: PlatformName, language: Lang, env: Env = process.env): Uploader {
  const L = language.toUpperCase();
  const label = `${NICE[platform]} ${L} (Upload-Post)`;
  const need = () => {
    const s = uploadPostSetup(language, env);
    if (!s) throw new PublishConfigError(`${label}: save your Upload-Post API key and profile names on the Channels page.`);
    return s;
  };

  return {
    platform,
    language,

    async check(): Promise<ChannelCheck> {
      try {
        const s = need();
        const profiles = await listUploadPostProfiles(s.apiKey, env);
        const profile = profiles.find((p) => p.username === s.user);
        if (!profile) return { ok: false, message: `Upload-Post has no profile called "${s.user}". Press Refresh on the Channels page.` };
        const name = profile.accounts[platform];
        if (!name) return { ok: false, message: `No ${NICE[platform]} account is connected to the Upload-Post profile "${s.user}" yet.` };
        return { ok: true, name, message: `Connected through Upload-Post (profile "${s.user}")${name !== "connected" ? `: ${name}` : ""}.` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },

    async upload(input: UploadInput): Promise<UploadResult> {
      const s = need();
      const isShort = input.format === "SHORT";
      const tags = hashLine(input.hashtags);
      const longCaption = (max: number) => cut([input.title, input.description, tags].filter(Boolean).join("\n\n"), max);

      const form = new FormData();
      const add = (k: string, v: string | number | boolean | null | undefined) => {
        if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
      };
      const ext = input.mimeType === "video/quicktime" ? "mov" : "mp4";
      form.append("video", new Blob([new Uint8Array(input.video)], { type: input.mimeType || "video/mp4" }), `video.${ext}`);
      add("user", s.user);
      add("platform[]", platform);
      add("title", cut(input.title, 100));
      add("description", longCaption(2200));
      // Wait for the answer, so we know the post really went up (the runner retries otherwise).
      add("async_upload", "false");

      switch (platform) {
        case "youtube": {
          // YouTube does not allow "<" or ">" in titles. Max 100 characters. Shorts get #Shorts.
          const clean = input.title.replace(/[<>]/g, "");
          add("youtube_title", cut(isShort && !/#shorts/i.test(clean) ? `${clean} #Shorts` : clean, 100));
          add("youtube_description", cut([input.description.replace(/[<>]/g, ""), tags].filter(Boolean).join("\n\n"), 5000));
          for (const t of input.hashtags.map((h) => h.replace(/^#/, "")).filter(Boolean).slice(0, 15)) form.append("tags[]", t);
          add("categoryId", env.YOUTUBE_CATEGORY_ID || "27");
          const privacy = (env.UPLOAD_POST_YOUTUBE_PRIVACY || "public").toLowerCase();
          add("privacyStatus", ["public", "unlisted", "private"].includes(privacy) ? privacy : "public");
          add("selfDeclaredMadeForKids", false);
          add("containsSyntheticMedia", (env.YOUTUBE_AI_LABEL ?? "true") !== "false");
          add("defaultLanguage", input.language);
          add("defaultAudioLanguage", input.language);
          if (input.thumbnail?.length) form.append("thumbnail", new Blob([new Uint8Array(input.thumbnail)], { type: "image/jpeg" }), "thumbnail.jpg");
          break;
        }
        case "instagram":
          add("instagram_title", longCaption(2200));
          add("media_type", "REELS");
          add("share_to_feed", true);
          break;
        case "facebook":
          add("facebook_title", cut(input.title, 250));
          add("facebook_description", longCaption(5000));
          add("facebook_media_type", isShort ? "REELS" : "VIDEO");
          add("facebook_page_id", env[`UPLOAD_POST_FACEBOOK_PAGE_${L}`]?.trim());
          break;
        case "tiktok": {
          // The TikTok upload window's choices win; Auto upload uses the defaults.
          const t = input.tiktok;
          add("tiktok_title", cut(t?.caption?.trim() || [input.title, tags].filter(Boolean).join(" "), 2200));
          add("privacy_level", t?.privacyLevel || env.UPLOAD_POST_TIKTOK_PRIVACY || "PUBLIC_TO_EVERYONE");
          add("disable_comment", t ? !t.allowComment : false);
          add("disable_duet", t ? !t.allowDuet : false);
          add("disable_stitch", t ? !t.allowStitch : false);
          add("is_aigc", (env.TIKTOK_AI_LABEL ?? "true") !== "false");
          if (t?.brandOrganic) add("brand_organic_toggle", true);
          if (t?.brandedContent) add("brand_content_toggle", true);
          add("post_mode", "DIRECT_POST");
          break;
        }
      }

      // The same key twice within 24 hours = one post. So a retry after a cut connection never posts twice.
      const headers: Record<string, string> = {};
      if (input.requestKey) headers["idempotency-key"] = `dualflow-${input.requestKey}-${platform}`;

      let body: any;
      try {
        body = await call(env, s.apiKey, "/upload", { method: "POST", body: form, headers, timeoutSec: 15 * 60, tries: 2 });
      } catch (err) {
        throw asPublishError(err, label);
      }

      let outcome = readOutcome(body, platform);
      // Still working on it: ask again every 20 seconds, for up to 10 minutes.
      const requestId = str(body?.request_id) ?? str(body?.data?.request_id);
      const until = Date.now() + Number(env.UPLOAD_POST_WAIT_MIN ?? 10) * MINUTE;
      while (outcome.state === "pending" && requestId && Date.now() < until) {
        await sleep(Number(env.UPLOAD_POST_POLL_MS ?? 20_000));
        try {
          const status = await call(env, s.apiKey, `/uploadposts/status?request_id=${encodeURIComponent(requestId)}`, { timeoutSec: 60 });
          outcome = readOutcome(status, platform);
        } catch (err) {
          console.log(`::warning::${label}: could not read the upload status: ${(err as Error).message}`);
        }
      }

      if (outcome.state === "failed") {
        const text = outcome.error ?? "failed";
        // "Not connected", "not allowed", "too long"... trying again later will not fix these.
        if (/not connected|no .*account|reconnect|reauth|unauthori|permission|privacy|not allowed|too long|duration|format/i.test(text)) {
          throw new PublishConfigError(`${label}: ${text}`);
        }
        throw new Error(`${label}: ${text}`);
      }
      if (outcome.state === "pending") {
        return {
          postId: requestId ?? "upload-post",
          url: null,
          note: "Sent to Upload-Post; it was still posting when we stopped waiting. Check upload-post.com → History.",
        };
      }
      return {
        postId: outcome.postId ?? requestId ?? "upload-post",
        url: outcome.url ?? null,
        note: "Posted through Upload-Post.",
      };
    },
  };
}
