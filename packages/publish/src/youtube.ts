/**
 * YouTube uploader (YouTube Data API v3, free).
 *
 * How it works:
 *  1. Swap the long-lived "refresh token" for a short "access token" (valid 1 hour).
 *  2. Start a "resumable upload": send the title, description and privacy first.
 *  3. Send the video bytes to the address YouTube gave back.
 *  4. Long videos: also set the thumbnail (Shorts cannot use a custom thumbnail).
 *
 * Settings: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN_NE / _EN.
 * YOUTUBE_PRIVACY: private (default) | unlisted | public.
 *   Until Google approves your project in the free "API audit", YouTube makes every
 *   API upload private anyway, so keep "private" until then.
 * YOUTUBE_CATEGORY_ID: default 27 (Education). 22 = People & Blogs, 25 = News.
 * YOUTUBE_AI_LABEL: "true" (default) tells YouTube the video uses AI (voice and script).
 */
import { nextPacificMidnight, PublishConfigError, PublishQuotaError } from "./errors";
import { cut, http, readJson } from "./http";
import type { ChannelCheck, Lang, UploadInput, UploadResult, Uploader } from "./types";

type Env = Record<string, string | undefined>;

export function youtubeUploader(language: Lang, env: Env = process.env): Uploader {
  const L = language.toUpperCase();
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  const refreshToken = env[`YOUTUBE_REFRESH_TOKEN_${L}`]?.trim();

  async function accessToken(): Promise<string> {
    if (!clientId || !clientSecret || !refreshToken) {
      throw new PublishConfigError(`YouTube ${L}: add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN_${L}.`);
    }
    const res = await http("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    const json = await readJson(res);
    if (!res.ok || !json.access_token) {
      // invalid_grant = the token was removed, expired (7 days in "Testing" mode) or is wrong.
      throw new PublishConfigError(
        `YouTube ${L}: Google refused the refresh token (${json.error ?? res.status}). ` +
          `Press Reconnect on the dashboard's Channels page, and make sure the Google app is "In production", not "Testing".`,
      );
    }
    return json.access_token as string;
  }

  /** Turn a YouTube error answer into the right kind of error. */
  function youtubeError(what: string, status: number, json: any): Error {
    const reason: string = json?.error?.errors?.[0]?.reason ?? json?.error?.status ?? "";
    const message: string = json?.error?.message ?? json?.raw ?? "";
    const text = `YouTube ${L} ${what} failed (${status} ${reason}): ${message}`.slice(0, 400);
    if (["quotaExceeded", "uploadLimitExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(reason)) {
      return new PublishQuotaError(text, nextPacificMidnight());
    }
    if (status === 401 || status === 403 || status === 400) return new PublishConfigError(text);
    return new Error(text);
  }

  return {
    platform: "youtube",
    language,

    async check(): Promise<ChannelCheck> {
      try {
        const token = await accessToken();
        const res = await http("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { authorization: `Bearer ${token}` },
        });
        const json = await readJson(res);
        if (!res.ok) throw youtubeError("channel check", res.status, json);
        const ch = json.items?.[0];
        if (!ch) return { ok: false, message: "This Google account has no YouTube channel yet." };
        return { ok: true, name: ch.snippet?.title, message: `Connected to channel "${ch.snippet?.title}".` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },

    async upload(input: UploadInput): Promise<UploadResult> {
      const token = await accessToken();
      const privacy = (env.YOUTUBE_PRIVACY || "private").toLowerCase();
      const isShort = input.format === "SHORT";
      const tags = input.hashtags.map((h) => h.replace(/^#/, "")).filter(Boolean);
      const hashLine = input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
      // YouTube does not allow "<" or ">" in titles. Titles: max 100 characters.
      const cleanTitle = input.title.replace(/[<>]/g, "");
      const title = cut(isShort && !/#shorts/i.test(cleanTitle) ? `${cleanTitle} #Shorts` : cleanTitle, 100);
      const description = cut([input.description.replace(/[<>]/g, ""), hashLine].filter(Boolean).join("\n\n"), 5000);

      const meta = {
        snippet: {
          title,
          description,
          tags: tags.slice(0, 15),
          categoryId: env.YOUTUBE_CATEGORY_ID || "27",
          defaultLanguage: input.language,
          defaultAudioLanguage: input.language,
        },
        status: {
          privacyStatus: ["private", "unlisted", "public"].includes(privacy) ? privacy : "private",
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: (env.YOUTUBE_AI_LABEL ?? "true") !== "false",
        },
      };

      // Step 1: start the upload and get the upload address.
      const start = await http(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-length": String(input.video.length),
            "x-upload-content-type": input.mimeType || "video/mp4",
          },
          body: JSON.stringify(meta),
        },
      );
      if (!start.ok) throw youtubeError("upload start", start.status, await readJson(start));
      const uploadUrl = start.headers.get("location");
      if (!uploadUrl) throw new Error(`YouTube ${L}: no upload address was returned.`);

      // Step 2: send the video. (One request; our videos are small. 10 minute limit.)
      const put = await http(uploadUrl, {
        method: "PUT",
        headers: { "content-type": input.mimeType || "video/mp4", "content-length": String(input.video.length) },
        body: new Uint8Array(input.video),
        timeoutSec: 600,
        tries: 2,
      });
      const video = await readJson(put);
      if (!put.ok || !video.id) throw youtubeError("video upload", put.status, video);

      // Step 3 (long videos only): the thumbnail. Needs a phone-verified channel; not fatal.
      let note = video.status?.privacyStatus === "private" && privacy !== "private" ? "YouTube kept it private (API audit not done yet)." : undefined;
      if (!isShort && input.thumbnail) {
        const thumb = await http(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(video.id)}&uploadType=media`,
          { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" }, body: new Uint8Array(input.thumbnail) },
        );
        if (!thumb.ok) note = [note, `Thumbnail not set (${thumb.status}); verify the channel with a phone number to allow custom thumbnails.`].filter(Boolean).join(" ");
      }
      const url = isShort ? `https://youtube.com/shorts/${video.id}` : `https://youtu.be/${video.id}`;
      return { postId: video.id, url, note };
    },
  };
}
