/**
 * TikTok uploader (TikTok Content Posting API, "Direct Post", free).
 *
 * IMPORTANT: until TikTok approves your app in its "audit", every post is
 * PRIVATE (only you can see it) and the TikTok account itself must be set to private.
 * After the audit you can set TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE.
 *
 * Steps:
 *  1. Swap the refresh token for an access token.
 *  2. Ask TikTok which privacy choices this account allows (creator_info).
 *  3. Start the post (init) and get an upload address.
 *  4. Send the video in pieces ("chunks").
 *  5. Ask for the status until TikTok says it is done.
 *
 * Settings: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN_NE / _EN,
 *           TIKTOK_PRIVACY (default SELF_ONLY), TIKTOK_AI_LABEL (default true).
 */
import { saveNewRefreshToken } from "./connections";
import { PublishConfigError, PublishQuotaError } from "./errors";
import { cut, http, readJson } from "./http";
import type { ChannelCheck, Lang, UploadInput, UploadResult, Uploader } from "./types";

type Env = Record<string, string | undefined>;
const API = "https://open.tiktokapis.com/v2";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** TikTok wants pieces between 5 MB and 64 MB (the last one may be bigger). */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) }; // the remainder goes in the last piece
}

function tiktokError(where: string, status: number, json: any): Error {
  const code: string = json?.error?.code ?? "";
  const text = `${where} failed (${status} ${code}): ${json?.error?.message ?? json?.raw ?? ""}`.slice(0, 400);
  if (code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts" || status === 429) {
    return new PublishQuotaError(text, new Date(Date.now() + 12 * 3600_000));
  }
  if (["access_token_invalid", "scope_not_authorized", "unaudited_client_can_only_post_to_private_accounts", "invalid_params", "privacy_level_option_mismatch"].includes(code) || status === 401 || status === 403) {
    return new PublishConfigError(text);
  }
  return new Error(text);
}

export function tiktokUploader(language: Lang, env: Env = process.env): Uploader {
  const L = language.toUpperCase();
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  let refreshToken = env[`TIKTOK_REFRESH_TOKEN_${L}`]?.trim();

  async function accessToken(): Promise<string> {
    if (!clientKey || !clientSecret || !refreshToken) {
      throw new PublishConfigError(`TikTok ${L}: add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REFRESH_TOKEN_${L}.`);
    }
    const res = await http(`${API}/oauth/token/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const json = await readJson(res);
    if (!res.ok || !json.access_token) {
      throw new PublishConfigError(`TikTok ${L}: TikTok refused the refresh token (${json.error ?? res.status}). Press Reconnect on the dashboard's Channels page.`);
    }
    if (json.refresh_token && json.refresh_token !== refreshToken) {
      // TikTok sometimes swaps the refresh token for a new one. Channels connected with the
      // dashboard's Connect button get the new one saved by themselves.
      // We never print it (it is secret). The old one keeps working until it expires.
      if (await saveNewRefreshToken("tiktok", language, json.refresh_token)) {
        refreshToken = json.refresh_token;
        console.log(`TikTok ${L} gave a new refresh token; it was saved for next time.`);
      } else {
        console.log(`::warning::TikTok ${L} gave a new refresh token. When uploads start failing, press Connect TikTok again on the Channels page.`);
      }
    }
    return json.access_token as string;
  }

  async function creatorInfo(token: string) {
    const res = await http(`${API}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    });
    const json = await readJson(res);
    if (!res.ok || json.error?.code !== "ok") throw tiktokError(`TikTok ${L} creator info`, res.status, json);
    return json.data as { creator_username?: string; creator_nickname?: string; privacy_level_options?: string[]; max_video_post_duration_sec?: number };
  }

  return {
    platform: "tiktok",
    language,

    async check(): Promise<ChannelCheck> {
      try {
        const info = await creatorInfo(await accessToken());
        return {
          ok: true,
          name: info.creator_username,
          message: `Connected to TikTok @${info.creator_username}. Allowed privacy: ${(info.privacy_level_options ?? []).join(", ")}.`,
        };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },

    async upload(input: UploadInput): Promise<UploadResult> {
      const token = await accessToken();
      const info = await creatorInfo(token);
      const wanted = (env.TIKTOK_PRIVACY || "SELF_ONLY").toUpperCase();
      const options = info.privacy_level_options ?? [];
      const privacy = options.includes(wanted) ? wanted : options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0];
      if (!privacy) throw new PublishConfigError(`TikTok ${L}: the account allows no privacy option.`);
      if (info.max_video_post_duration_sec && input.durationSec && input.durationSec > info.max_video_post_duration_sec) {
        throw new PublishConfigError(`TikTok ${L}: the video is ${Math.round(input.durationSec)} s, but this account allows ${info.max_video_post_duration_sec} s.`);
      }

      const size = input.video.length;
      const { chunkSize, count } = chunkPlan(size);
      const tags = input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
      const initRes = await http(`${API}/post/publish/video/init/`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          post_info: {
            title: cut([input.title, tags].filter(Boolean).join(" "), 2200),
            privacy_level: privacy,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            is_aigc: (env.TIKTOK_AI_LABEL ?? "true") !== "false",
          },
          source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
        }),
      });
      const init = await readJson(initRes);
      if (!initRes.ok || init.error?.code !== "ok") throw tiktokError(`TikTok ${L} start`, initRes.status, init);
      const { publish_id: publishId, upload_url: uploadUrl } = init.data;

      // Send the pieces in order.
      for (let i = 0; i < count; i++) {
        const from = i * chunkSize;
        const to = i === count - 1 ? size : from + chunkSize; // last piece takes the rest
        const res = await http(uploadUrl, {
          method: "PUT",
          headers: { "content-type": input.mimeType || "video/mp4", "content-length": String(to - from), "content-range": `bytes ${from}-${to - 1}/${size}` },
          body: new Uint8Array(input.video.subarray(from, to)),
          timeoutSec: 600,
          tries: 2,
        });
        if (!res.ok) throw new Error(`TikTok ${L} upload piece ${i + 1}/${count} failed (${res.status}).`);
      }

      // Wait until TikTok has processed it (up to about 5 minutes).
      for (let i = 0; i < 30; i++) {
        await sleep(10_000);
        const res = await http(`${API}/post/publish/status/fetch/`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ publish_id: publishId }),
        });
        const st = await readJson(res);
        const status = st.data?.status;
        if (status === "PUBLISH_COMPLETE") {
          const postId = st.data?.publicaly_available_post_id?.[0];
          return {
            postId: String(postId ?? publishId),
            url: postId && info.creator_username ? `https://www.tiktok.com/@${info.creator_username}/video/${postId}` : null,
            note: privacy === "SELF_ONLY" ? "Posted as private (only you can see it) until TikTok approves the app." : undefined,
          };
        }
        if (status === "FAILED") throw new Error(`TikTok ${L} could not post the video: ${st.data?.fail_reason ?? "unknown reason"}`);
      }
      // Uploaded but still processing: count it as done, so it is not posted twice.
      return { postId: String(publishId), url: null, note: "TikTok is still processing the video." };
    },
  };
}
