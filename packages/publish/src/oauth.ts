/**
 * One-click "Connect" for the dashboard (OAuth).
 *
 * How OAuth works, in short:
 *   1. We send you to Google / Facebook / TikTok with OUR app's id ("authorize address").
 *   2. You sign in there and press Allow. Your password never comes to us.
 *   3. The platform sends you back to our dashboard with a one-time "code".
 *   4. Our server swaps that code (plus the app's secret) for a long-lasting token.
 *   5. We ask the platform for the channel's name, so you can see the right one is connected.
 *
 * These functions only talk to the platforms. Saving (encrypted) happens in the API.
 */
import { http, readJson } from "./http";
import type { AppKeys, DbPlatform } from "./connections";
import type { Lang } from "./types";

type Env = Record<string, string | undefined>;

/**
 * The buttons: YouTube, Meta (Facebook Pages + their Instagram), TikTok, and Instagram on its own
 * ("Instagram Login": for an Instagram professional account with no Facebook Page).
 */
export type ConnectPlatform = "youtube" | "meta" | "tiktok" | "instagram";
export const CONNECT_PLATFORMS: ConnectPlatform[] = ["youtube", "meta", "tiktok", "instagram"];

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management", "instagram_basic", "instagram_content_publish"];
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];

/** One account that a Connect button found. */
export interface ConnectedAccount {
  platform: DbPlatform;
  language: Lang;
  name: string;
  externalId: string | null;
  /** Facebook / Instagram: the Page token (it does not expire). */
  accessToken?: string;
  /** YouTube / TikTok: the long-lasting refresh token. */
  refreshToken?: string;
}

export class ConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectError";
  }
}

const graph = (env: Env) => `https://graph.facebook.com/${(env.META_GRAPH_VERSION || "v24.0").trim()}`;
const metaDialog = (env: Env) => `https://www.facebook.com/${(env.META_GRAPH_VERSION || "v24.0").trim()}/dialog/oauth`;

/** Step 1: the address we send you to. */
export function authorizeUrl(platform: ConnectPlatform, app: AppKeys, redirectUri: string, state: string, env: Env = process.env): string {
  switch (platform) {
    case "youtube": {
      const q = new URLSearchParams({
        client_id: app.id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: YOUTUBE_SCOPES.join(" "),
        access_type: "offline", // = give us a refresh token
        prompt: "consent select_account", // always ask, so you can pick the channel (Brand account)
        include_granted_scopes: "false",
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    case "meta": {
      const q = new URLSearchParams({ client_id: app.id, redirect_uri: redirectUri, response_type: "code", state });
      // Apps made with "Facebook Login for Business" use a configuration id instead of a scope list.
      if (app.configId) q.set("config_id", app.configId);
      else q.set("scope", META_SCOPES.join(","));
      return `${metaDialog(env)}?${q}`;
    }
    case "tiktok": {
      const q = new URLSearchParams({ client_key: app.id, redirect_uri: redirectUri, response_type: "code", scope: TIKTOK_SCOPES.join(","), state });
      return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
    }
    case "instagram": {
      // force_reauth = always show the Instagram login, so you can pick the Nepali or the English account.
      const q = new URLSearchParams({ client_id: app.id, redirect_uri: redirectUri, response_type: "code", scope: INSTAGRAM_SCOPES.join(","), state, force_reauth: "true" });
      return `https://www.instagram.com/oauth/authorize?${q}`;
    }
  }
}

/** Steps 4 + 5: swap the code for tokens and find the account names. */
export async function finishConnect(
  platform: ConnectPlatform,
  app: AppKeys,
  code: string,
  redirectUri: string,
  language: Lang,
  env: Env = process.env,
): Promise<ConnectedAccount[]> {
  switch (platform) {
    case "youtube":
      return [await finishYouTube(app, code, redirectUri, language)];
    case "meta":
      return finishMeta(app, code, redirectUri, env);
    case "tiktok":
      return [await finishTikTok(app, code, redirectUri, language)];
    case "instagram":
      return [await finishInstagram(app, code, redirectUri, language, env)];
  }
}

async function finishYouTube(app: AppKeys, code: string, redirectUri: string, language: Lang): Promise<ConnectedAccount> {
  const res = await http("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: app.id, client_secret: app.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    tries: 1, // a code works only once
  });
  const json = await readJson(res);
  if (!res.ok || !json.access_token) {
    if (json.error === "redirect_uri_mismatch") throw new ConnectError(`Google says the return address is not on your list. In Google Cloud, add exactly ${redirectUri} under Authorized redirect URIs.`);
    if (json.error === "invalid_client") throw new ConnectError("Google does not know this Client ID / Client secret. Check them on the Channels page.");
    throw new ConnectError(`Google refused (${json.error ?? res.status}${json.error_description ? `: ${json.error_description}` : ""}). Press Connect again.`);
  }
  if (!json.refresh_token) {
    throw new ConnectError("Google gave no long-lasting token. Open myaccount.google.com/permissions, remove DualFlow, then press Connect again.");
  }
  const ch = await http("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${json.access_token}` } });
  const cj = await readJson(ch);
  const item = cj.items?.[0];
  if (!ch.ok) throw new ConnectError(`Connected, but YouTube refused to show the channel (${cj.error?.message ?? ch.status}). Is "YouTube Data API v3" turned on in Google Cloud?`);
  if (!item) throw new ConnectError("This Google account has no YouTube channel. When Google asks, pick the Namaste Facts channel (not your own name).");
  return { platform: "YOUTUBE", language, name: item.snippet?.title ?? "YouTube channel", externalId: item.id ?? null, refreshToken: json.refresh_token };
}

/** "Nepali" Page? We look for नेपाली or "Nepali" in its name. */
export function looksNepali(name: string): boolean {
  return /नेपाली|nepali/i.test(name);
}

interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

/** Which Page is for which language: the Nepali-looking one for Nepali, the other one for English. */
export function pickPages(pages: MetaPage[]): { ne?: MetaPage; en?: MetaPage } {
  const usable = pages.filter((p) => p.access_token);
  const ne = usable.find((p) => looksNepali(p.name));
  const others = usable.filter((p) => p !== ne);
  const en = others.find((p) => /namaste/i.test(p.name)) ?? others[0];
  return { ne, en };
}

async function finishMeta(app: AppKeys, code: string, redirectUri: string, env: Env): Promise<ConnectedAccount[]> {
  const g = graph(env);
  // a) code -> short user token (1-2 hours)
  const r1 = await http(`${g}/oauth/access_token?${new URLSearchParams({ client_id: app.id, client_secret: app.secret, redirect_uri: redirectUri, code })}`, { tries: 1 });
  const j1 = await readJson(r1);
  if (!r1.ok || !j1.access_token) {
    throw new ConnectError(`Facebook refused (${j1.error?.message ?? r1.status}). Check the App ID and App secret, and that ${redirectUri} is in "Valid OAuth Redirect URIs".`);
  }
  // b) short token -> long token (about 60 days). Page tokens made from it never expire.
  const r2 = await http(`${g}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: j1.access_token })}`);
  const j2 = await readJson(r2);
  const userToken: string = j2.access_token ?? j1.access_token;
  // c) your Pages, each with its own token and its linked Instagram account
  const r3 = await http(`${g}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" })}`, {
    headers: { authorization: `Bearer ${userToken}` },
  });
  const j3 = await readJson(r3);
  if (!r3.ok) throw new ConnectError(`Facebook did not list your Pages (${j3.error?.message ?? r3.status}).`);
  let pages: MetaPage[] = j3.data ?? [];
  // d) Empty list? Pages that live in a business portfolio sometimes only show up through the
  //    token's "granted Page ids" or through the business itself. Ask those two places too.
  const info = await tokenInfo(g, app, userToken);
  if (pages.length === 0) pages = await pagesFromOtherPlaces(g, userToken, info.pageIds);
  if (pages.length === 0) throw new ConnectError(noPagesMessage(info.scopes, Boolean(app.configId), await whoAmI(g, userToken)));
  const { ne, en } = pickPages(pages);
  const out: ConnectedAccount[] = [];
  for (const [language, page] of [["ne", ne], ["en", en]] as const) {
    if (!page?.access_token) continue;
    out.push({ platform: "FACEBOOK", language, name: page.name, externalId: page.id, accessToken: page.access_token });
    const ig = page.instagram_business_account;
    if (ig?.id) out.push({ platform: "INSTAGRAM", language, name: ig.username ? `@${ig.username}` : `Instagram of ${page.name}`, externalId: ig.id, accessToken: page.access_token });
  }
  return out;
}

async function finishTikTok(app: AppKeys, code: string, redirectUri: string, language: Lang): Promise<ConnectedAccount> {
  const res = await http("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: app.id, client_secret: app.secret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    tries: 1,
  });
  const json = await readJson(res);
  if (!res.ok || !json.refresh_token) {
    throw new ConnectError(`TikTok refused (${json.error ?? res.status}${json.error_description ? `: ${json.error_description}` : ""}). Press Connect again (the code works only once, for a few minutes).`);
  }
  let name = "TikTok account";
  try {
    const u = await http("https://open.tiktokapis.com/v2/user/info/?fields=display_name", { headers: { authorization: `Bearer ${json.access_token}` } });
    const uj = await readJson(u);
    if (uj.data?.user?.display_name) name = uj.data.user.display_name;
  } catch {
    /* the name is only for show */
  }
  return { platform: "TIKTOK", language, name, externalId: json.open_id ?? null, refreshToken: json.refresh_token };
}

/** Permissions the Page + Instagram uploads need. */
const NEEDED_META = ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish"];

/** Which needed permissions are missing from what Facebook gave us. */
export function missingMetaScopes(granted: string[]): string[] {
  return NEEDED_META.filter((s) => !granted.includes(s));
}

/** A clear "what to fix" message when Facebook gives back no Pages. */
export function noPagesMessage(granted: string[], usesConfigId: boolean, who?: string): string {
  const missing = missingMetaScopes(granted);
  if (granted.length > 0 && missing.length > 0) {
    const where = usesConfigId
      ? `Your "Facebook Login for Business" configuration only asks for: ${granted.join(", ")}. In Meta for Developers, make a new configuration with Access token = "User access token" and these permissions: ${NEEDED_META.join(", ")}, business_management. Paste its Configuration ID in Step A, then press Connect again.`
      : `Facebook only gave: ${granted.join(", ")}. Press Connect again and allow everything.`;
    return `Facebook shows no Pages, because it did not give these permissions: ${missing.join(", ")}. ${where}`;
  }
  const as = who
    ? ` Facebook says you were logged in as "${who}". If that is a Page (not your own personal profile), click your picture on facebook.com, switch to your personal profile, then press Connect again.`
    : "";
  return `Facebook shows no Pages.${as} Make sure you are a full admin ("Full control") of both Pages, choose "Opt in to all current and future Pages" in the Facebook window, then press Connect again.`;
}

/** Ask Facebook what this token may do: its permissions and the Page ids it was given. */
async function tokenInfo(g: string, app: AppKeys, token: string): Promise<{ scopes: string[]; pageIds: string[] }> {
  try {
    const r = await http(`${g}/debug_token?${new URLSearchParams({ input_token: token, access_token: `${app.id}|${app.secret}` })}`);
    const j = await readJson(r);
    const d = j.data ?? {};
    const pageIds = new Set<string>();
    for (const gs of d.granular_scopes ?? []) {
      if (String(gs.scope).startsWith("pages_")) for (const id of gs.target_ids ?? []) pageIds.add(String(id));
    }
    return { scopes: Array.isArray(d.scopes) ? d.scopes.map(String) : [], pageIds: [...pageIds] };
  } catch {
    return { scopes: [], pageIds: [] };
  }
}

const PAGE_FIELDS = "id,name,access_token,instagram_business_account{id,username}";

/** Backup ways to find the Pages: granted Page ids, then the Pages of your business portfolios. */
async function pagesFromOtherPlaces(g: string, token: string, grantedIds: string[]): Promise<MetaPage[]> {
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const ids = new Set(grantedIds);
  try {
    const r = await http(`${g}/me/businesses?${new URLSearchParams({ fields: "id,owned_pages.limit(100){id},client_pages.limit(100){id}", limit: "50" })}`, auth);
    const j = await readJson(r);
    for (const b of j.data ?? []) {
      for (const p of [...(b.owned_pages?.data ?? []), ...(b.client_pages?.data ?? [])]) if (p?.id) ids.add(String(p.id));
    }
  } catch {
    /* no business access: fine, we still try the granted ids */
  }
  const pages: MetaPage[] = [];
  for (const id of ids) {
    try {
      const r = await http(`${g}/${encodeURIComponent(id)}?${new URLSearchParams({ fields: PAGE_FIELDS })}`, auth);
      const j = await readJson(r);
      if (r.ok && j.id) pages.push(j as MetaPage);
    } catch {
      /* skip a Page we cannot read */
    }
  }
  return pages;
}

/** The name of the Facebook profile that pressed Allow (it can be a Page profile by mistake). */
async function whoAmI(g: string, token: string): Promise<string | undefined> {
  try {
    const r = await http(`${g}/me?fields=name`, { headers: { authorization: `Bearer ${token}` } });
    const j = await readJson(r);
    return r.ok && typeof j.name === "string" ? j.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Instagram Login: code -> short token (1 hour) -> long token (60 days).
 * The long token is saved as the "refresh token": every upload run swaps it for a fresh 60-day one.
 */
async function finishInstagram(app: AppKeys, code: string, redirectUri: string, language: Lang, env: Env): Promise<ConnectedAccount> {
  const cleanCode = code.replace(/#_$/, ""); // Instagram adds "#_" to the end of the code
  const r1 = await http("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.id, client_secret: app.secret, grant_type: "authorization_code", redirect_uri: redirectUri, code: cleanCode }),
    tries: 1,
  });
  const j1raw = await readJson(r1);
  const j1 = Array.isArray(j1raw.data) ? j1raw.data[0] ?? {} : j1raw;
  if (!r1.ok || !j1.access_token) {
    const why = j1raw.error_message || j1raw.error?.message || j1raw.error_description || r1.status;
    throw new ConnectError(`Instagram refused (${why}). Check the Instagram app ID and secret (Instagram → API setup with Instagram login → Business login settings), and that ${redirectUri} is in its "OAuth redirect URIs".`);
  }
  const perms: string[] = typeof j1.permissions === "string" ? j1.permissions.split(",") : Array.isArray(j1.permissions) ? j1.permissions : [];
  if (perms.length > 0 && !perms.includes("instagram_business_content_publish")) {
    throw new ConnectError("Instagram did not allow posting. Press Connect again and allow everything Instagram asks.");
  }
  const r2 = await http(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: app.secret, access_token: j1.access_token })}`);
  const j2 = await readJson(r2);
  if (!r2.ok || !j2.access_token) throw new ConnectError(`Instagram gave no long-lasting token (${j2.error?.message ?? r2.status}). Press Connect again.`);
  const version = (env.META_GRAPH_VERSION || "v24.0").trim();
  const me = await http(`https://graph.instagram.com/${version}/me?fields=user_id,username`, { headers: { authorization: `Bearer ${j2.access_token}` } });
  const mj = await readJson(me);
  if (!me.ok) throw new ConnectError(`Connected, but Instagram did not show the account (${mj.error?.message ?? me.status}). Is it a Professional (Creator or Business) account?`);
  return {
    platform: "INSTAGRAM",
    language,
    name: mj.username ? `@${mj.username}` : "Instagram account",
    externalId: String(mj.user_id ?? j1.user_id ?? "") || null,
    refreshToken: j2.access_token,
  };
}
