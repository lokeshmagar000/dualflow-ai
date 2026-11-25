/**
 * Upload-Post tests. A fake fetch() plays the part of Upload-Post, so no account or network is needed.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  configuredChannels,
  connectionsToEnv,
  getUploader,
  lockSecret,
  missingSettings,
  PublishConfigError,
  PublishQuotaError,
  readOutcome,
  readProfile,
  SETTING,
} from "./index";

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetch(handler: (c: Call) => { status?: number; json?: any }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const call = { url: String(input), method: init.method ?? "GET", headers, body: init.body };
    calls.push(call);
    const r = handler(call);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const env = {
  UPLOAD_POST_API_KEY: "KEY",
  UPLOAD_POST_USER_NE: "namaste-facts-ne",
  UPLOAD_POST_USER_EN: "namaste-facts-en",
  UPLOAD_POST_PLATFORMS_NE: "youtube,instagram",
  UPLOAD_POST_PLATFORMS_EN: "instagram,tiktok",
  UPLOAD_POST_POLL_MS: "1",
};
const input = {
  language: "ne" as const,
  format: "SHORT" as const,
  video: Buffer.alloc(1024, 1),
  thumbnail: Buffer.alloc(10, 2),
  title: "सगरमाथा <रहस्य>",
  description: "विश्वको सबैभन्दा अग्लो हिमाल",
  hashtags: ["nepal", "#everest"],
  durationSec: 40,
  requestKey: "pub1",
};

test("Upload-Post accounts count as configured channels, and need no other settings", () => {
  const list = configuredChannels(env).map((c) => `${c.platform}-${c.language}`);
  assert.deepEqual(list.sort(), ["instagram-en", "instagram-ne", "tiktok-en", "youtube-ne"].sort());
  assert.deepEqual(missingSettings("youtube", "ne", env), []);
  // Not connected on Upload-Post: the direct settings are still needed.
  assert.ok(missingSettings("youtube", "en", env).length > 0);
});

test("the dashboard's saved Upload-Post box becomes the same settings", () => {
  const keyEnv = { R2_SECRET_ACCESS_KEY: "a-long-test-secret-for-the-box" };
  const value = lockSecret(JSON.stringify({ apiKey: "KEY", users: { ne: "n", en: "e" }, platforms: { ne: ["tiktok"], en: ["youtube", "bogus"] } }), keyEnv);
  const { overlay, problems } = connectionsToEnv([{ key: SETTING.uploadPost, value }], [], keyEnv);
  assert.deepEqual(problems, []);
  assert.equal(overlay.UPLOAD_POST_API_KEY, "KEY");
  assert.equal(overlay.UPLOAD_POST_USER_NE, "n");
  assert.equal(overlay.UPLOAD_POST_PLATFORMS_NE, "tiktok");
  assert.equal(overlay.UPLOAD_POST_PLATFORMS_EN, "youtube");
});

test("profiles: only accounts that are really connected", () => {
  const p = readProfile({ username: "x", social_accounts: { youtube: { display_name: "Namaste Facts" }, tiktok: "", instagram: {}, facebook: null } });
  assert.deepEqual(p.accounts, { youtube: "Namaste Facts" });
});

test("YouTube through Upload-Post: one multipart request with the right fields", async () => {
  const calls = fakeFetch(() => ({ json: { success: true, results: { youtube: { success: true, url: "https://youtube.com/shorts/ABC", platform_post_id: "ABC" } } } }));
  const res = await getUploader("youtube", "ne", env).upload(input);
  assert.equal(res.postId, "ABC");
  assert.equal(res.url, "https://youtube.com/shorts/ABC");
  assert.equal(calls.length, 1);
  const c = calls[0]!;
  assert.equal(c.url, "https://api.upload-post.com/api/upload");
  assert.equal(c.headers.authorization, "Apikey KEY");
  assert.equal(c.headers["idempotency-key"], "dualflow-pub1-youtube");
  const form = c.body as FormData;
  assert.equal(form.get("user"), "namaste-facts-ne");
  assert.deepEqual(form.getAll("platform[]"), ["youtube"]);
  assert.equal(form.get("youtube_title"), "सगरमाथा रहस्य #Shorts");
  assert.equal(form.get("privacyStatus"), "public");
  assert.deepEqual(form.getAll("tags[]"), ["nepal", "everest"]);
  assert.ok(form.get("video") instanceof Blob);
  assert.ok(form.get("thumbnail") instanceof Blob);
});

test("TikTok: the upload window's choices are sent", async () => {
  const calls = fakeFetch(() => ({ json: { success: true, data: { platforms: [{ name: "tiktok", url: "https://tiktok.com/@x/video/1" }] } } }));
  const res = await getUploader("tiktok", "en", env).upload({
    ...input,
    language: "en",
    tiktok: { privacyLevel: "SELF_ONLY", caption: "Hi #nepal", allowComment: true, allowDuet: false, allowStitch: false },
  });
  assert.equal(res.url, "https://tiktok.com/@x/video/1");
  const form = calls[0]!.body as FormData;
  assert.equal(form.get("privacy_level"), "SELF_ONLY");
  assert.equal(form.get("tiktok_title"), "Hi #nepal");
  assert.equal(form.get("disable_comment"), "false");
  assert.equal(form.get("disable_duet"), "true");
});

test("still working: asks the status until it is done", async () => {
  let n = 0;
  const calls = fakeFetch((c) => {
    if (c.url.endsWith("/upload")) return { json: { success: true, request_id: "R1" } };
    n++;
    return { json: n < 2 ? { status: "in_progress" } : { status: "completed", results: { instagram: { success: true, url: "https://instagram.com/reel/Z" } } } };
  });
  const res = await getUploader("instagram", "ne", env).upload(input);
  assert.equal(res.url, "https://instagram.com/reel/Z");
  assert.ok(calls.some((c) => c.url.includes("/uploadposts/status?request_id=R1")));
});

test("errors: plan limit waits, a platform that is not connected stops", async () => {
  fakeFetch(() => ({ status: 403, json: { success: false, message: "Monthly upload limit reached. Upgrade your plan." } }));
  await assert.rejects(getUploader("instagram", "ne", env).upload(input), PublishQuotaError);
  fakeFetch(() => ({ json: { success: true, results: { instagram: { success: false, error: "Instagram account not connected" } } } }));
  await assert.rejects(getUploader("instagram", "ne", env).upload(input), PublishConfigError);
  fakeFetch(() => ({ status: 401, json: { message: "Invalid API key" } }));
  await assert.rejects(getUploader("instagram", "ne", env).upload(input), PublishConfigError);
});

test("readOutcome understands the answer shapes", () => {
  assert.equal(readOutcome({ results: { tiktok: { success: true, publish_id: "p" } } }, "tiktok").postId, "p");
  assert.equal(readOutcome({ results: [{ platform: "youtube", post_url: "u" }] }, "youtube").url, "u");
  assert.equal(readOutcome({ success: true, request_id: "x" }, "youtube").state, "pending");
});
