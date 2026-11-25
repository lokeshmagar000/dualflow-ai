import { test } from "node:test";
import assert from "node:assert/strict";
import { lockSecret, unlockSecret, SecretKeyError, secretKeyId } from "./secret-box";
import { connectionsToEnv, SETTING, switchToEnv } from "./connections";
import { authorizeUrl, looksNepali, missingMetaScopes, noPagesMessage, pickPages } from "./oauth";
import { configuredChannels, publishEnabled, dryRun, modeFor } from "./config";

const env = { R2_SECRET_ACCESS_KEY: "r2-secret-for-tests" };

test("a locked secret unlocks with the same key, and never contains the plain text", () => {
  const locked = lockSecret("1//refresh-token", env);
  assert.ok(!locked.includes("refresh-token"));
  assert.equal(unlockSecret(locked, env), "1//refresh-token");
  assert.notEqual(lockSecret("1//refresh-token", env), locked, "a new random start each time");
});

test("TOKEN_KEY wins over R2_SECRET_ACCESS_KEY, and a different key is explained", () => {
  const a = { ...env, TOKEN_KEY: "own-key" };
  assert.notEqual(secretKeyId(a), secretKeyId(env));
  const locked = lockSecret("x", a);
  assert.throws(() => unlockSecret(locked, env), (e: Error) => e instanceof SecretKeyError && /different key/.test(e.message));
  assert.throws(() => lockSecret("x", {}), SecretKeyError);
});

test("dashboard connections become the same env names the uploaders read", () => {
  const settings = [
    { key: SETTING.youtubeApp, value: lockSecret(JSON.stringify({ id: "gid", secret: "gsecret" }), env) },
    { key: SETTING.uploadSwitch, value: JSON.stringify({ mode: "auto" }) },
  ];
  const channels = [
    { platform: "YOUTUBE" as const, language: "ne" as const, externalId: "UC1", accessTokenEnc: null, refreshTokenEnc: lockSecret("yt-ne", env) },
    { platform: "FACEBOOK" as const, language: "en" as const, externalId: "123", accessTokenEnc: lockSecret("page-en", env), refreshTokenEnc: null },
    { platform: "INSTAGRAM" as const, language: "en" as const, externalId: "IG9", accessTokenEnc: lockSecret("page-en", env), refreshTokenEnc: null },
  ];
  const { overlay, problems } = connectionsToEnv(settings, channels, env);
  assert.deepEqual(problems, []);
  assert.equal(overlay.YOUTUBE_CLIENT_ID, "gid");
  assert.equal(overlay.YOUTUBE_REFRESH_TOKEN_NE, "yt-ne");
  assert.equal(overlay.FACEBOOK_PAGE_ID_EN, "123");
  assert.equal(overlay.INSTAGRAM_USER_ID_EN, "IG9");
  assert.equal(overlay.INSTAGRAM_TOKEN_EN, "page-en");

  const all = { ...env, PUBLISH_ENABLED: "false", ...overlay };
  assert.equal(publishEnabled(all), true);
  assert.equal(dryRun(all), false);
  assert.equal(modeFor("youtube", all), "auto");
  const labels = configuredChannels(all).map((c) => `${c.platform}-${c.language}`).sort();
  assert.deepEqual(labels, ["facebook-en", "instagram-en", "youtube-ne"]);
});

test("a token locked with another key is skipped and explained, the rest still works", () => {
  const other = lockSecret("old", { TOKEN_KEY: "other" });
  const { overlay, problems } = connectionsToEnv(
    [],
    [
      { platform: "TIKTOK", language: "en", externalId: null, accessTokenEnc: null, refreshTokenEnc: other },
      { platform: "TIKTOK", language: "ne", externalId: null, accessTokenEnc: null, refreshTokenEnc: lockSecret("tt-ne", env) },
    ],
    env,
  );
  assert.equal(overlay.TIKTOK_REFRESH_TOKEN_EN, undefined);
  assert.equal(overlay.TIKTOK_REFRESH_TOKEN_NE, "tt-ne");
  assert.equal(problems.length, 1);
});

test("switch positions", () => {
  assert.equal(switchToEnv("off").PUBLISH_MODE, "manual"); // buttons still work, nothing by itself
  assert.equal(switchToEnv("practice").PUBLISH_DRY_RUN, "true");
  assert.equal(switchToEnv("approval").PUBLISH_MODE, "approval");
});

test("Facebook Pages are matched to languages by name", () => {
  assert.ok(looksNepali("Namaste Facts नेपाली"));
  assert.ok(looksNepali("Namaste Facts Nepali"));
  assert.ok(!looksNepali("Namaste Facts"));
  const pages = [
    { id: "1", name: "My bakery", access_token: "a" },
    { id: "2", name: "Namaste Facts नेपाली", access_token: "b" },
    { id: "3", name: "Namaste Facts", access_token: "c" },
  ];
  const { ne, en } = pickPages(pages);
  assert.equal(ne?.id, "2");
  assert.equal(en?.id, "3");
});

test("sign-in addresses carry the app id, the return address and the state", () => {
  const app = { id: "cid", secret: "s" };
  const yt = new URL(authorizeUrl("youtube", app, "https://x.onrender.com/connect/youtube/callback", "st"));
  assert.equal(yt.searchParams.get("access_type"), "offline");
  assert.equal(yt.searchParams.get("redirect_uri"), "https://x.onrender.com/connect/youtube/callback");
  const meta = new URL(authorizeUrl("meta", { ...app, configId: "99" }, "https://x/cb", "st", {}));
  assert.equal(meta.searchParams.get("config_id"), "99");
  assert.equal(meta.searchParams.get("scope"), null);
  const tt = new URL(authorizeUrl("tiktok", app, "https://x/cb", "st"));
  assert.equal(tt.searchParams.get("client_key"), "cid");
  assert.ok(!tt.toString().includes("secret"));
});

test("no Pages: the message names the missing Facebook permissions", () => {
  const granted = ["business_management", "pages_show_list"];
  assert.deepEqual(missingMetaScopes(granted), ["pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish"]);
  const msg = noPagesMessage(granted, true);
  assert.match(msg, /pages_manage_posts/);
  assert.match(msg, /User access token/);
  assert.match(noPagesMessage([], true), /Full control/);
  assert.match(noPagesMessage([], true, "Namaste Facts"), /logged in as "Namaste Facts".*personal profile/);
  assert.match(noPagesMessage(["pages_show_list", "pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish"], true), /Full control/);
});
