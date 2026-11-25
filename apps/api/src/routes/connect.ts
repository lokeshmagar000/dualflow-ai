/**
 * One-click channel connections and the "Auto upload" switch (dashboard Channels page).
 *
 *   GET  /connect                       what is connected, which app keys are saved, the switch
 *   POST /connect/:platform/keys        save your app's id + secret (locked) for youtube | meta | tiktok | instagram
 *   POST /connect/:platform/start       { language, redirectUri } -> { url } to send you to sign in
 *   POST /connect/:platform/finish      { code, state, redirectUri } -> saves the tokens (locked)
 *   POST /connect/:platform/disconnect  { language? } forget the tokens
 *   POST /connect/meta/swap             Facebook/Instagram: swap which Page is Nepali and which English
 *   POST /connect/switch                { mode: off | practice | approval | auto }
 *   POST /connect/test                  asks every connected channel "who are you?" (uploads nothing)
 *
 * Tokens and app secrets are locked (AES-256-GCM, see packages/publish/src/secret-box.ts)
 * before they go into the database, and they are never sent back to the browser.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Language, type Platform } from "@dualflow/db";
import {
  authorizeUrl,
  CONNECT_PLATFORMS,
  ConnectError,
  connectionsToEnv,
  finishConnect,
  getUploader,
  lockSecret,
  readAppKeys,
  readSwitch,
  secretBoxReady,
  secretKeyId,
  secretKeySource,
  setRefreshTokenSaver,
  SETTING,
  UPLOAD_SWITCHES,
  type ConnectPlatform,
  type PlatformName,
} from "@dualflow/publish";
import { getDefaultWorkspace } from "../workspace";

const APP_KEY: Record<ConnectPlatform, string> = { youtube: SETTING.youtubeApp, meta: SETTING.metaApp, tiktok: SETTING.tiktokApp, instagram: SETTING.instagramApp };
const DB_PLATFORMS: Record<ConnectPlatform, Platform[]> = { youtube: ["YOUTUBE"], meta: ["FACEBOOK", "INSTAGRAM"], tiktok: ["TIKTOK"], instagram: ["INSTAGRAM"] };
const STATE_MAX_AGE_MS = 20 * 60_000; // the sign-in must finish within 20 minutes

const platformParam = z.object({ platform: z.enum(CONNECT_PLATFORMS as [ConnectPlatform, ...ConnectPlatform[]]) });
const keysBody = z.object({
  id: z.string().trim().min(3).max(300),
  secret: z.string().trim().max(300).optional(), // empty = keep the saved secret (change only the id)
  configId: z.string().trim().max(100).optional(),
});
const httpsUrl = z.string().url().max(500).refine((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), "Must be an https address");
const startBody = z.object({ language: z.enum(["ne", "en"]).default("en"), redirectUri: httpsUrl });
const finishBody = z.object({ code: z.string().min(4).max(2000), state: z.string().min(10).max(500), redirectUri: httpsUrl });

/* ---------- the "state": proves the answer belongs to a sign-in WE started ---------- */

function stateKey() {
  const k = process.env.INTERNAL_API_KEY || process.env.TOKEN_KEY || process.env.R2_SECRET_ACCESS_KEY || "";
  if (!k) throw new ConnectError("The server has no secret to sign the sign-in with (INTERNAL_API_KEY).");
  return k;
}

export function makeState(platform: ConnectPlatform, language: Language, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ p: platform, l: language, t: now, n: randomBytes(8).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readState(state: string, platform: ConnectPlatform, now = Date.now()): { language: Language } {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new ConnectError("The sign-in answer is not complete. Press Connect again.");
  const want = createHmac("sha256", stateKey()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ConnectError("This sign-in was not started here. Press Connect again.");
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p: string; l: Language; t: number };
  if (data.p !== platform) throw new ConnectError("This sign-in was for another platform. Press Connect again.");
  if (now - data.t > STATE_MAX_AGE_MS) throw new ConnectError("The sign-in took too long (over 20 minutes). Press Connect again.");
  return { language: data.l === "ne" ? "ne" : "en" };
}

/* ---------- helpers ---------- */

async function getSetting(workspaceId: string, key: string) {
  return (await prisma.appSetting.findUnique({ where: { workspaceId_key: { workspaceId, key } } }))?.value;
}

async function putSetting(workspaceId: string, key: string, value: string) {
  await prisma.appSetting.upsert({ where: { workspaceId_key: { workspaceId, key } }, update: { value }, create: { workspaceId, key, value } });
}

/** Show only the start and end of an id, e.g. "1234…apps.googleusercontent.com" -> "1234…com". */
function hint(id: string) {
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function needKey() {
  if (!secretBoxReady()) {
    throw new ConnectError("This server has no key to lock tokens with. On Render (dualflow-web) add R2_SECRET_ACCESS_KEY, the same value as in GitHub Secrets.");
  }
}

/** Upload-switch position -> mode saved on the channel rows (the worker keeps it up to date too). */
function channelMode(mode: string | null) {
  return mode === "auto" || mode === "practice" ? "AUTO" : "APPROVAL";
}

/** TikTok (and Instagram Login) sometimes give a new token while we check or upload: keep it (locked). */
export async function saveTikTokToken(language: Language, token: string, platform: "TIKTOK" | "INSTAGRAM" = "TIKTOK") {
  const ws = await getDefaultWorkspace();
  await prisma.channel.updateMany({ where: { workspaceId: ws.id, platform, language }, data: { refreshTokenEnc: lockSecret(token) } });
}

export async function connectRoutes(app: FastifyInstance) {
  setRefreshTokenSaver((p, language, token) => saveTikTokToken(language, token, p === "instagram" ? "INSTAGRAM" : "TIKTOK"));

  app.get("/connect", async () => {
    const ws = await getDefaultWorkspace();
    const [settings, channels] = await Promise.all([
      prisma.appSetting.findMany({ where: { workspaceId: ws.id } }),
      prisma.channel.findMany({ where: { workspaceId: ws.id }, orderBy: [{ platform: "asc" }, { language: "asc" }] }),
    ]);
    const byKey = new Map(settings.map((s) => [s.key, s.value]));
    const apps: Record<string, { saved: boolean; idHint: string | null; configId: string | null; problem: string | null }> = {};
    for (const p of CONNECT_PLATFORMS) {
      try {
        const k = readAppKeys(byKey.get(APP_KEY[p]));
        apps[p] = { saved: Boolean(k), idHint: k ? hint(k.id) : null, configId: k?.configId ?? null, problem: null };
      } catch (err) {
        apps[p] = { saved: false, idHint: null, configId: null, problem: (err as Error).message };
      }
    }
    return {
      keyReady: secretBoxReady(),
      keySource: secretKeySource(),
      keyId: secretKeyId(), // the worker prints its own; if they differ, the keys differ
      switch: readSwitch(byKey.get(SETTING.uploadSwitch)), // null = never used: the GitHub variables decide
      apps,
      channels: channels.map((c) => ({
        id: c.id,
        platform: c.platform,
        language: c.language,
        name: c.name,
        connected: Boolean(c.accessTokenEnc || c.refreshTokenEnc), // connected with a Connect button
        updatedAt: c.updatedAt,
      })),
    };
  });

  app.post<{ Params: { platform: string } }>("/connect/:platform/keys", async (req, reply) => {
    const { platform } = platformParam.parse(req.params);
    const body = keysBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Paste the id and the secret (they look like long random text)." });
    needKey();
    const ws = await getDefaultWorkspace();
    let secret = body.data.secret;
    if (!secret) {
      const old = readAppKeys(await getSetting(ws.id, APP_KEY[platform]));
      if (!old) return reply.code(400).send({ error: "Paste the secret too." });
      secret = old.secret;
    }
    const value = lockSecret(JSON.stringify({ id: body.data.id, secret, ...(body.data.configId ? { configId: body.data.configId } : {}) }));
    await putSetting(ws.id, APP_KEY[platform], value);
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "connect.keys", target: platform } });
    return { ok: true };
  });

  app.post<{ Params: { platform: string } }>("/connect/:platform/start", async (req, reply) => {
    const { platform } = platformParam.parse(req.params);
    const body = startBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "The dashboard address must start with https://" });
    const ws = await getDefaultWorkspace();
    const keys = readAppKeys(await getSetting(ws.id, APP_KEY[platform]));
    if (!keys) return reply.code(409).send({ error: "Save your app's id and secret first (step 1 in this box)." });
    return { url: authorizeUrl(platform, keys, body.data.redirectUri, makeState(platform, body.data.language)) };
  });

  app.post<{ Params: { platform: string } }>("/connect/:platform/finish", async (req, reply) => {
    const { platform } = platformParam.parse(req.params);
    const body = finishBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "The sign-in answer is not complete. Press Connect again." });
    try {
      needKey();
      const { language } = readState(body.data.state, platform);
      const ws = await getDefaultWorkspace();
      const keys = readAppKeys(await getSetting(ws.id, APP_KEY[platform]));
      if (!keys) throw new ConnectError("Save your app's id and secret first.");
      const accounts = await finishConnect(platform, keys, body.data.code, body.data.redirectUri, language);
      const mode = channelMode(readSwitch(await getSetting(ws.id, SETTING.uploadSwitch)));
      for (const a of accounts) {
        const where = { workspaceId: ws.id, platform: a.platform as Platform, language: a.language as Language };
        const data = {
          name: a.name,
          externalId: a.externalId,
          accessTokenEnc: a.accessToken ? lockSecret(a.accessToken) : null,
          refreshTokenEnc: a.refreshToken ? lockSecret(a.refreshToken) : null,
        };
        const existing = await prisma.channel.findFirst({ where });
        if (existing) await prisma.channel.update({ where: { id: existing.id }, data });
        else await prisma.channel.create({ data: { ...where, ...data, mode } });
      }
      await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "connect.done", target: `${platform}:${accounts.map((a) => `${a.platform}-${a.language}`).join(",")}` } });
      const lang = (l: string) => (l === "ne" ? "Nepali" : "English");
      return { ok: true, message: `Connected: ${accounts.map((a) => `${a.name} (${a.platform.toLowerCase()}, ${lang(a.language)})`).join(", ")}.` };
    } catch (err) {
      req.log.warn({ platform, err: (err as Error).message }, "connect failed");
      const message = err instanceof ConnectError || (err as Error).name === "SecretKeyError" ? (err as Error).message : `Could not connect: ${(err as Error).message}`;
      return reply.code(422).send({ error: message.slice(0, 500) });
    }
  });

  app.post<{ Params: { platform: string }; Body: { language?: string } }>("/connect/:platform/disconnect", async (req) => {
    const { platform } = platformParam.parse(req.params);
    const ws = await getDefaultWorkspace();
    const language = req.body?.language === "ne" || req.body?.language === "en" ? (req.body.language as Language) : undefined;
    const res = await prisma.channel.updateMany({
      where: { workspaceId: ws.id, platform: { in: DB_PLATFORMS[platform] }, ...(language ? { language } : {}) },
      data: { accessTokenEnc: null, refreshTokenEnc: null, externalId: null },
    });
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "connect.removed", target: `${platform}:${language ?? "both"}` } });
    return { ok: true, count: res.count };
  });

  // Facebook + Instagram: we guess the language from the Page name (नेपाली / Nepali). This fixes a wrong guess.
  app.post("/connect/meta/swap", async (_req, reply) => {
    const ws = await getDefaultWorkspace();
    const rows = await prisma.channel.findMany({ where: { workspaceId: ws.id, platform: { in: ["FACEBOOK", "INSTAGRAM"] } } });
    if (rows.length === 0) return reply.code(409).send({ error: "Connect Facebook first." });
    const tokenFields = (c: (typeof rows)[number]) => ({ name: c.name, externalId: c.externalId, accessTokenEnc: c.accessTokenEnc, refreshTokenEnc: c.refreshTokenEnc });
    const empty = { externalId: null, accessTokenEnc: null, refreshTokenEnc: null };
    await prisma.$transaction(async (tx) => {
      for (const platform of ["FACEBOOK", "INSTAGRAM"] as const) {
        const ne = rows.find((r) => r.platform === platform && r.language === "ne");
        const en = rows.find((r) => r.platform === platform && r.language === "en");
        if (!ne && !en) continue;
        // Swap only the account details. The rows (and their upload history) stay with their language.
        const neData = en ? tokenFields(en) : { ...empty, name: `${platform === "FACEBOOK" ? "Facebook" : "Instagram"} (Nepali)` };
        const enData = ne ? tokenFields(ne) : { ...empty, name: `${platform === "FACEBOOK" ? "Facebook" : "Instagram"} (English)` };
        if (ne) await tx.channel.update({ where: { id: ne.id }, data: neData });
        else await tx.channel.create({ data: { workspaceId: ws.id, platform, language: "ne", mode: en!.mode, ...neData } });
        if (en) await tx.channel.update({ where: { id: en.id }, data: enData });
        else await tx.channel.create({ data: { workspaceId: ws.id, platform, language: "en", mode: ne!.mode, ...enData } });
      }
    });
    return { ok: true };
  });

  app.post<{ Body: { mode?: string } }>("/connect/switch", async (req, reply) => {
    const mode = String(req.body?.mode ?? "");
    if (!UPLOAD_SWITCHES.includes(mode as never)) return reply.code(400).send({ error: "Pick Off, Practice, Ask me first or Fully automatic." });
    const ws = await getDefaultWorkspace();
    await putSetting(ws.id, SETTING.uploadSwitch, JSON.stringify({ mode }));
    await prisma.channel.updateMany({ where: { workspaceId: ws.id }, data: { mode: channelMode(mode) } });
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "publish.switch", target: mode } });
    return { ok: true, mode };
  });

  // "Test now": the same check as the "Test my channels" workflow, but right here, for connected channels.
  app.post("/connect/test", async () => {
    const ws = await getDefaultWorkspace();
    const [settings, channels] = await Promise.all([
      prisma.appSetting.findMany({ where: { workspaceId: ws.id } }),
      prisma.channel.findMany({ where: { workspaceId: ws.id, OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }] } }),
    ]);
    const { overlay, problems } = connectionsToEnv(settings, channels);
    const env = { ...process.env, ...overlay };
    const results: { platform: string; language: string; ok: boolean; message: string }[] = [];
    for (const c of channels) {
      const res = await getUploader(c.platform.toLowerCase() as PlatformName, c.language, env).check();
      results.push({ platform: c.platform, language: c.language, ok: res.ok, message: res.message });
    }
    return { results, problems };
  });
}
