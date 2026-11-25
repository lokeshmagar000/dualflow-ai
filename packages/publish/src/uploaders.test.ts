/**
 * Uploader tests. A fake fetch() plays the part of YouTube, Meta and TikTok,
 * so no real account or network is needed.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chunkPlan, choosePrivacy, configuredChannels, tiktokCreator, getUploader, missingSettings, modeFor, PublishConfigError, PublishQuotaError } from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace fetch with `handler`; returns the list of calls made. */
function fakeFetch(handler: (c: Call) => { status?: number; json?: any; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const call = { url: String(input), method: init.method ?? "GET", headers, body: init.body };
    calls.push(call);
    const r = handler(call);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return calls;
}

const video = Buffer.alloc(1024, 1);
const input = {
  language: "ne" as const,
  format: "SHORT" as const,
  video,
  title: "सगरमाथा <रहस्य>",
  description: "विश्वको सबैभन्दा अग्लो हिमाल",
  hashtags: ["nepal", "#everest"],
  durationSec: 40,
};
const ytEnv = { YOUTUBE_CLIENT_ID: "id", YOUTUBE_CLIENT_SECRET: "secret", YOUTUBE_REFRESH_TOKEN_NE: "refresh" };

test("only channels with every setting are used, one per language", () => {
  const env = { ...ytEnv, FACEBOOK_PAGE_ID_EN: "1", FACEBOOK_PAGE_TOKEN_EN: "t", INSTAGRAM_USER_ID_EN: "2", PUBLISH_MODE: "auto", PUBLISH_MODE_INSTAGRAM: "manual" };
  const list = configuredChannels(env).map((c) => `${c.label}:${c.mode}`);
  assert.deepEqual(list, ["YouTube (Nepali):auto", "Facebook (English):auto", "Instagram (English):manual"]);
  assert.deepEqual(missingSettings("tiktok", "ne", env), ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN_NE"]);
  assert.equal(modeFor("youtube", {}), "approval"); // the safe default
  assert.deepEqual(configuredChannels({ ...env, PUBLISH_PLATFORMS: "facebook" }).map((c) => c.platform), ["facebook"]);
});

test("YouTube: refresh token -> resumable upload -> video id", async () => {
  const calls = fakeFetch((c) => {
    if (c.url.includes("oauth2")) return { json: { access_token: "ACCESS" } };
    if (c.url.includes("uploadType=resumable")) return { headers: { location: "https://upload.example/abc" } };
    if (c.url === "https://upload.example/abc") return { json: { id: "VID123", status: { privacyStatus: "private" } } };
    return { status: 404, json: {} };
  });
  const res = await getUploader("youtube", "ne", ytEnv).upload(input);
  assert.equal(res.postId, "VID123");
  assert.equal(res.url, "https://youtube.com/shorts/VID123");
  const meta = JSON.parse(calls[1]!.body);
  assert.equal(meta.snippet.title, "सगरमाथा रहस्य #Shorts"); // no < > and #Shorts added
  assert.equal(meta.status.privacyStatus, "private"); // safe default before the audit
  assert.deepEqual(meta.snippet.tags, ["nepal", "everest"]);
  assert.equal(calls[1]!.headers.authorization, "Bearer ACCESS");
  assert.equal(calls.length, 3); // Shorts: no thumbnail call
});

test("YouTube: used-up quota waits for tomorrow; a bad token stops", async () => {
  fakeFetch((c) =>
    c.url.includes("oauth2")
      ? { json: { access_token: "A" } }
      : { status: 403, json: { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } } },
  );
  await assert.rejects(getUploader("youtube", "ne", ytEnv).upload(input), PublishQuotaError);
  fakeFetch(() => ({ status: 400, json: { error: "invalid_grant" } }));
  await assert.rejects(getUploader("youtube", "ne", ytEnv).upload(input), PublishConfigError);
  const check = await getUploader("youtube", "ne", ytEnv).check();
  assert.equal(check.ok, false);
  assert.match(check.message, /In production/);
});

test("Instagram: container -> upload -> wait -> publish", async () => {
  const env = { INSTAGRAM_USER_ID_NE: "IG1", FACEBOOK_PAGE_TOKEN_NE: "PAGE", INSTAGRAM_PROCESS_WAIT_SECONDS: "30" };
  const calls = fakeFetch((c) => {
    if (c.url.endsWith("/IG1/media")) return { json: { id: "C1" } };
    if (c.url.includes("rupload")) return { json: { success: true } };
    if (c.url.includes("C1?fields=status_code")) return { json: { status_code: "FINISHED" } };
    if (c.url.endsWith("/media_publish")) return { json: { id: "POST9" } };
    if (c.url.includes("POST9?fields=permalink")) return { json: { permalink: "https://instagram.com/reel/x" } };
    return { status: 404, json: {} };
  });
  // Skip the 10 s waits.
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
  try {
    const res = await getUploader("instagram", "ne", env).upload(input);
    assert.equal(res.postId, "POST9");
    assert.equal(res.url, "https://instagram.com/reel/x");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  const create = JSON.parse(calls[0]!.body);
  assert.equal(create.media_type, "REELS");
  assert.equal(create.upload_type, "resumable");
  assert.match(create.caption, /#nepal #everest/);
  assert.equal(calls[1]!.headers.authorization, "OAuth PAGE");
  assert.equal(calls[1]!.headers.file_size, "1024");
});

test("Facebook: a bad page token is a settings problem (no endless retries)", async () => {
  fakeFetch(() => ({ status: 400, json: { error: { code: 190, message: "Invalid OAuth access token" } } }));
  await assert.rejects(getUploader("facebook", "en", { FACEBOOK_PAGE_ID_EN: "1", FACEBOOK_PAGE_TOKEN_EN: "x" }).upload({ ...input, language: "en" }), PublishConfigError);
});

test("TikTok: picks private when the app is not audited yet, and splits big files", async () => {
  const env = { TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s", TIKTOK_REFRESH_TOKEN_NE: "r", TIKTOK_PRIVACY: "PUBLIC_TO_EVERYONE" };
  const calls = fakeFetch((c) => {
    if (c.url.includes("oauth/token")) return { json: { access_token: "A", refresh_token: "r" } };
    if (c.url.includes("creator_info")) return { json: { error: { code: "ok" }, data: { creator_username: "me", privacy_level_options: ["SELF_ONLY"] } } };
    if (c.url.includes("video/init")) return { json: { error: { code: "ok" }, data: { publish_id: "P1", upload_url: "https://up.tiktok/x" } } };
    if (c.url === "https://up.tiktok/x") return { status: 201 };
    if (c.url.includes("status/fetch")) return { json: { error: { code: "ok" }, data: { status: "PUBLISH_COMPLETE" } } };
    return { status: 404, json: {} };
  });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
  try {
    const res = await getUploader("tiktok", "ne", env).upload(input);
    assert.equal(res.postId, "P1");
    assert.match(res.note ?? "", /private/);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  const init = JSON.parse(calls.find((c) => c.url.includes("video/init"))!.body);
  assert.equal(init.post_info.privacy_level, "SELF_ONLY");
  assert.equal(init.source_info.total_chunk_count, 1);
  const put = calls.find((c) => c.url === "https://up.tiktok/x")!;
  assert.equal(put.headers["content-range"], "bytes 0-1023/1024");

  const MB = 1024 * 1024;
  assert.deepEqual(chunkPlan(30 * MB), { chunkSize: 30 * MB, count: 1 });
  assert.deepEqual(chunkPlan(105 * MB), { chunkSize: 10 * MB, count: 10 }); // last piece is 15 MB
});

test("TikTok: the upload window's choices are sent as they are", async () => {
  const env = { TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s", TIKTOK_REFRESH_TOKEN_NE: "r" };
  const calls = fakeFetch((c) => {
    if (c.url.includes("oauth/token")) return { json: { access_token: "A", refresh_token: "r" } };
    if (c.url.includes("creator_info")) {
      return { json: { error: { code: "ok" }, data: {
        creator_username: "namaste", creator_nickname: "Namaste Facts", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], stitch_disabled: true,
      } } };
    }
    if (c.url.includes("video/init")) return { json: { error: { code: "ok" }, data: { publish_id: "P2", upload_url: "https://up.tiktok/y" } } };
    if (c.url === "https://up.tiktok/y") return { status: 201 };
    if (c.url.includes("status/fetch")) return { json: { error: { code: "ok" }, data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [77] } } };
    return { status: 404, json: {} };
  });
  const creator = await tiktokCreator("ne", env);
  assert.equal(creator.nickname, "Namaste Facts");
  assert.deepEqual(creator.privacyOptions, ["PUBLIC_TO_EVERYONE", "SELF_ONLY"]);
  assert.equal(creator.stitchDisabled, true);

  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
  try {
    const tiktok = { privacyLevel: "PUBLIC_TO_EVERYONE", caption: "My own caption", allowComment: true, allowDuet: false, allowStitch: true, brandOrganic: true };
    const res = await getUploader("tiktok", "ne", env).upload({ ...input, tiktok });
    assert.equal(res.url, "https://www.tiktok.com/@namaste/video/77");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  const init = JSON.parse(calls.find((c) => c.url.includes("video/init"))!.body);
  assert.equal(init.post_info.privacy_level, "PUBLIC_TO_EVERYONE");
  assert.equal(init.post_info.title, "My own caption");
  assert.equal(init.post_info.disable_comment, false);
  assert.equal(init.post_info.disable_duet, true);
  assert.equal(init.post_info.disable_stitch, true); // the account has stitch off
  assert.equal(init.post_info.brand_organic_toggle, true);
  assert.equal(init.post_info.brand_content_toggle, false);
});

test("TikTok: a picked privacy the account does not allow is never swapped silently", () => {
  assert.equal(choosePrivacy(["SELF_ONLY"], "PUBLIC_TO_EVERYONE", "SELF_ONLY"), undefined);
  assert.equal(choosePrivacy(["SELF_ONLY", "PUBLIC_TO_EVERYONE"], "PUBLIC_TO_EVERYONE", "SELF_ONLY"), "PUBLIC_TO_EVERYONE");
  assert.equal(choosePrivacy(["SELF_ONLY"], undefined, "PUBLIC_TO_EVERYONE"), "SELF_ONLY"); // Auto upload: old behaviour
});

test("Instagram Login (no Facebook Page): graph.instagram.com, fresh token, saved", async () => {
  const { setRefreshTokenSaver } = await import("./connections");
  const saved: string[] = [];
  setRefreshTokenSaver(async (p, l, t) => void saved.push(`${p}:${l}:${t}`));
  const env = { INSTAGRAM_USER_ID_EN: "1789", INSTAGRAM_LOGIN_TOKEN_EN: "OLD", INSTAGRAM_PROCESS_WAIT_SECONDS: "30" };
  assert.deepEqual(missingSettings("instagram", "en", env), []);
  const calls = fakeFetch((c) => {
    if (c.url.includes("refresh_access_token")) return { json: { access_token: "NEW" } };
    if (c.url.endsWith("graph.instagram.com/v24.0/me/media")) return { json: { id: "C1", uri: "https://rupload.facebook.com/ig-api-upload/v24.0/C1" } };
    if (c.url.includes("rupload")) return { json: { success: true } };
    if (c.url.includes("C1?fields=status_code")) return { json: { status_code: "FINISHED" } };
    if (c.url.endsWith("/me/media_publish")) return { json: { id: "P1" } };
    if (c.url.includes("P1?fields=permalink")) return { json: { permalink: "https://instagram.com/reel/y" } };
    return { status: 404, json: {} };
  });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
  try {
    const res = await getUploader("instagram", "en", env).upload({ ...input, language: "en" });
    assert.equal(res.postId, "P1");
  } finally {
    globalThis.setTimeout = realSetTimeout;
    setRefreshTokenSaver(null);
  }
  assert.deepEqual(saved, ["instagram:en:NEW"]);
  assert.ok(calls.filter((c) => !c.url.includes("refresh_access_token")).every((c) => !c.url.includes("graph.facebook.com")));
  assert.equal(calls.find((c) => c.url.includes("rupload"))!.headers.authorization, "OAuth NEW");
});
