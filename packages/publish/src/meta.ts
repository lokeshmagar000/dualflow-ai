/**
 * Facebook Page and Instagram uploaders (Meta Graph API, free).
 *
 * Both use a "Page access token": made once from your Facebook account,
 * it does not expire if you make it the right way (see docs/social-setup.md).
 * The Instagram account must be a Professional (Business) account linked to the Page.
 *
 * Settings (per language, _NE / _EN):
 *   FACEBOOK_PAGE_ID_NE, FACEBOOK_PAGE_TOKEN_NE
 *   INSTAGRAM_USER_ID_NE (the Instagram Business account id), INSTAGRAM_TOKEN_NE (optional;
 *   the Facebook page token is used if it is missing)
 *   META_GRAPH_VERSION  default v24.0
 *
 * Videos are sent straight from our file (to rupload.facebook.com),
 * so the video never needs a public web address.
 */
import { PublishConfigError, PublishQuotaError } from "./errors";
import { cut, http, readJson } from "./http";
import type { ChannelCheck, Lang, UploadInput, UploadResult, Uploader } from "./types";

type Env = Record<string, string | undefined>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function graphBase(env: Env) {
  const version = (env.META_GRAPH_VERSION || "v24.0").trim();
  return { version, graph: `https://graph.facebook.com/${version}` };
}

/** Meta error codes: 4/17/32/613 = too many calls, 190 = bad/expired token, 10/200+ = missing permission. */
function metaError(where: string, status: number, json: any): Error {
  const e = json?.error ?? {};
  const code = Number(e.code);
  const text = `${where} failed (${status}${code ? ` code ${code}` : ""}): ${e.error_user_msg || e.message || json?.raw || "unknown error"}`.slice(0, 400);
  if ([4, 17, 32, 613].includes(code) || e.error_subcode === 2207042) {
    return new PublishQuotaError(text, new Date(Date.now() + 6 * 3600_000)); // try again in 6 hours
  }
  if (code === 190 || code === 10 || (code >= 200 && code < 300) || code === 100) return new PublishConfigError(text);
  return new Error(text);
}

function caption(input: UploadInput, max: number): string {
  const tags = input.hashtags
    .slice(0, 30) // Instagram allows 30 hashtags at most
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  return cut([input.title, input.description, tags].filter(Boolean).join("\n\n"), max);
}

/* ------------------------------ Facebook ------------------------------ */

export function facebookUploader(language: Lang, env: Env = process.env): Uploader {
  const L = language.toUpperCase();
  const pageId = env[`FACEBOOK_PAGE_ID_${L}`]?.trim();
  const token = env[`FACEBOOK_PAGE_TOKEN_${L}`]?.trim();
  const { version, graph } = graphBase(env);
  const need = () => {
    if (!pageId || !token) throw new PublishConfigError(`Facebook ${L}: add FACEBOOK_PAGE_ID_${L} and FACEBOOK_PAGE_TOKEN_${L}.`);
    return { pageId, token };
  };

  return {
    platform: "facebook",
    language,

    async check(): Promise<ChannelCheck> {
      try {
        const { pageId, token } = need();
        const res = await http(`${graph}/${encodeURIComponent(pageId)}?fields=name`, { headers: { authorization: `Bearer ${token}` } });
        const json = await readJson(res);
        if (!res.ok) throw metaError(`Facebook ${L} page check`, res.status, json);
        return { ok: true, name: json.name, message: `Connected to Facebook page "${json.name}".` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },

    /** Upload as a Reel (short videos) or a normal Page video (long videos). */
    async upload(input: UploadInput): Promise<UploadResult> {
      const { pageId, token } = need();
      const auth = { authorization: `Bearer ${token}` };

      if (input.format === "LONG") {
        // Long video: one form upload to graph-video (max 1 GB / 20 min).
        const form = new FormData();
        form.set("title", cut(input.title, 250));
        form.set("description", caption(input, 5000));
        form.set("source", new Blob([new Uint8Array(input.video)], { type: "video/mp4" }), "video.mp4");
        const res = await http(`https://graph-video.facebook.com/${version}/${encodeURIComponent(pageId)}/videos`, {
          method: "POST", headers: auth, body: form, timeoutSec: 600, tries: 2,
        });
        const json = await readJson(res);
        if (!res.ok || !json.id) throw metaError(`Facebook ${L} video upload`, res.status, json);
        return { postId: json.id, url: `https://www.facebook.com/${pageId}/videos/${json.id}` };
      }

      // Reel, step 1: ask for an upload slot.
      const startRes = await http(`${graph}/${encodeURIComponent(pageId)}/video_reels`, {
        method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ upload_phase: "start" }),
      });
      const start = await readJson(startRes);
      if (!startRes.ok || !start.video_id) throw metaError(`Facebook ${L} reel start`, startRes.status, start);

      // Step 2: send the bytes.
      const up = await http(start.upload_url || `https://rupload.facebook.com/video-upload/${version}/${start.video_id}`, {
        method: "POST",
        headers: { authorization: `OAuth ${token}`, offset: "0", file_size: String(input.video.length), "content-type": "application/octet-stream" },
        body: new Uint8Array(input.video), timeoutSec: 600, tries: 2,
      });
      const upJson = await readJson(up);
      if (!up.ok || upJson.success === false) throw metaError(`Facebook ${L} reel upload`, up.status, upJson);

      // Step 3: publish it with the caption.
      const finRes = await http(`${graph}/${encodeURIComponent(pageId)}/video_reels`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: caption(input, 2200) }),
      });
      const fin = await readJson(finRes);
      if (!finRes.ok || fin.success === false) throw metaError(`Facebook ${L} reel publish`, finRes.status, fin);
      return { postId: String(start.video_id), url: `https://www.facebook.com/reel/${start.video_id}`, note: "Facebook may take a few minutes to process the reel." };
    },
  };
}

/* ------------------------------ Instagram ------------------------------ */

export function instagramUploader(language: Lang, env: Env = process.env): Uploader {
  const L = language.toUpperCase();
  const igId = env[`INSTAGRAM_USER_ID_${L}`]?.trim();
  const token = (env[`INSTAGRAM_TOKEN_${L}`] || env[`FACEBOOK_PAGE_TOKEN_${L}`])?.trim();
  const { version, graph } = graphBase(env);
  const need = () => {
    if (!igId || !token) throw new PublishConfigError(`Instagram ${L}: add INSTAGRAM_USER_ID_${L} (and FACEBOOK_PAGE_TOKEN_${L}).`);
    return { igId, token };
  };
  /** How long to wait for Instagram to process the video (default 5 minutes). */
  const waitSec = Number(env.INSTAGRAM_PROCESS_WAIT_SECONDS ?? 300);

  return {
    platform: "instagram",
    language,

    async check(): Promise<ChannelCheck> {
      try {
        const { igId, token } = need();
        const res = await http(`${graph}/${encodeURIComponent(igId)}?fields=username`, { headers: { authorization: `Bearer ${token}` } });
        const json = await readJson(res);
        if (!res.ok) throw metaError(`Instagram ${L} account check`, res.status, json);
        // How many posts the API made in the last 24 hours (limit about 100... Meta may lower it).
        const limRes = await http(`${graph}/${encodeURIComponent(igId)}/content_publishing_limit?fields=quota_usage,config`, { headers: { authorization: `Bearer ${token}` } });
        const lim = limRes.ok ? (await readJson(limRes)).data?.[0] : null;
        const used = lim ? ` Posts in the last 24 h: ${lim.quota_usage ?? 0} of ${lim.config?.quota_total ?? "?"}.` : "";
        return { ok: true, name: json.username, message: `Connected to Instagram @${json.username}.${used}` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },

    async upload(input: UploadInput): Promise<UploadResult> {
      const { igId, token } = need();
      const auth = { authorization: `Bearer ${token}` };

      // Step 1: make a "container" for a Reel, with resumable upload.
      const createRes = await http(`${graph}/${encodeURIComponent(igId)}/media`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ media_type: "REELS", upload_type: "resumable", caption: caption(input, 2200), share_to_feed: true }),
      });
      const created = await readJson(createRes);
      if (!createRes.ok || !created.id) throw metaError(`Instagram ${L} container`, createRes.status, created);

      // Step 2: send the bytes.
      const up = await http(created.uri || `https://rupload.facebook.com/ig-api-upload/${version}/${created.id}`, {
        method: "POST",
        headers: { authorization: `OAuth ${token}`, offset: "0", file_size: String(input.video.length), "content-type": "application/octet-stream" },
        body: new Uint8Array(input.video), timeoutSec: 600, tries: 2,
      });
      const upJson = await readJson(up);
      if (!up.ok || upJson.success === false) throw metaError(`Instagram ${L} upload`, up.status, upJson);

      // Step 3: wait until Instagram has processed the video.
      const until = Date.now() + waitSec * 1000;
      let status = "IN_PROGRESS";
      while (Date.now() < until) {
        await sleep(10_000);
        const st = await readJson(await http(`${graph}/${created.id}?fields=status_code,status`, { headers: auth }));
        status = st.status_code ?? status;
        if (status === "FINISHED") break;
        if (status === "ERROR" || status === "EXPIRED") throw new Error(`Instagram ${L} could not process the video: ${st.status ?? status}`);
      }
      if (status !== "FINISHED") throw new Error(`Instagram ${L} is still processing the video after ${waitSec} s; will try again.`);

      // Step 4: publish.
      const pubRes = await http(`${graph}/${encodeURIComponent(igId)}/media_publish`, {
        method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ creation_id: created.id }),
      });
      const pub = await readJson(pubRes);
      if (!pubRes.ok || !pub.id) throw metaError(`Instagram ${L} publish`, pubRes.status, pub);
      const link = await readJson(await http(`${graph}/${pub.id}?fields=permalink`, { headers: auth }));
      return { postId: pub.id, url: link.permalink ?? null };
    },
  };
}
