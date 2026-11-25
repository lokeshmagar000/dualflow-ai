/**
 * The Upload-Post box on the Channels page: ONE service that posts to YouTube, Instagram,
 * TikTok and Facebook, so you do not need a developer app for each of them.
 *
 *   POST /connect/uploadpost/save     { apiKey?, userNe?, userEn? }  check the key, make the 2 profiles, save (locked)
 *   POST /connect/uploadpost/refresh  look again which accounts are connected on Upload-Post
 *   POST /connect/uploadpost/link     { language, redirectUrl } -> { url } Upload-Post's "connect accounts" page
 *   POST /connect/uploadpost/remove   forget the key (the direct Connect buttons work again)
 *
 * The API key is locked (AES-256-GCM) before it goes into the database and never goes back to the browser.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Language, type Platform } from "@dualflow/db";
import {
  createUploadPostProfile,
  listUploadPostProfiles,
  lockSecret,
  readSwitch,
  readUploadPost,
  secretBoxReady,
  SETTING,
  UPLOAD_POST_DEFAULT_USERS,
  uploadPostConnectLink,
  type Lang,
  type PlatformName,
  type UploadPostSaved,
} from "@dualflow/publish";
import { getDefaultWorkspace } from "../workspace";

const NICE: Record<PlatformName, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const LANG_NAME: Record<Lang, string> = { ne: "Nepali", en: "English" };
const LANGS: Lang[] = ["ne", "en"];

const profileName = z.string().trim().max(60).regex(/^[A-Za-z0-9_.-]*$/, "A profile name can only have letters, numbers, - _ and .");
const saveBody = z.object({ apiKey: z.string().trim().max(2000).optional(), userNe: profileName.optional(), userEn: profileName.optional() });
const linkBody = z.object({
  language: z.enum(["ne", "en"]),
  redirectUrl: z.string().url().max(500).refine((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), "Must be an https address"),
});

async function getSetting(workspaceId: string, key: string) {
  return (await prisma.appSetting.findUnique({ where: { workspaceId_key: { workspaceId, key } } }))?.value;
}

/** What the Upload-Post box saved, or null. A key that cannot be unlocked counts as "not saved". */
export async function loadUploadPost(workspaceId: string): Promise<UploadPostSaved | null> {
  try {
    return readUploadPost(await getSetting(workspaceId, SETTING.uploadPost));
  } catch {
    return null;
  }
}

/** "YOUTUBE-en", "TIKTOK-ne", ...: the channels Upload-Post posts to. */
export function uploadPostKeys(saved: UploadPostSaved | null): Set<string> {
  const out = new Set<string>();
  if (!saved) return out;
  for (const l of LANGS) {
    if (!saved.users[l]) continue;
    for (const p of saved.platforms[l]) out.add(`${p.toUpperCase()}-${l}`);
  }
  return out;
}

/** For the Channels page: everything except the key itself. */
export function uploadPostStatus(saved: UploadPostSaved | null, problem: string | null = null) {
  return {
    saved: Boolean(saved),
    keyHint: saved ? `…${saved.apiKey.slice(-4)}` : null,
    users: saved?.users ?? { ne: "", en: "" },
    platforms: saved?.platforms ?? { ne: [], en: [] },
    accounts: saved?.accounts ?? { ne: {}, en: {} },
    checkedAt: saved?.checkedAt ?? null,
    problem,
  };
}

class BoxError extends Error {}

/**
 * Ask Upload-Post which accounts each profile has, make a missing profile, save it all
 * (locked) and make one channel row per connected account, so the dashboard shows it.
 */
async function checkAndSave(workspaceId: string, saved: UploadPostSaved, makeMissing: boolean): Promise<{ saved: UploadPostSaved; notes: string[] }> {
  const notes: string[] = [];
  let profiles;
  try {
    profiles = await listUploadPostProfiles(saved.apiKey);
  } catch (err) {
    const msg = (err as Error).message;
    throw new BoxError(/401|403|unauthori|invalid|api ?key/i.test(msg) ? "Upload-Post did not accept this API key. Copy it again from upload-post.com → API Keys." : msg);
  }
  for (const l of LANGS) {
    const user = saved.users[l];
    if (!user || profiles.some((p) => p.username === user)) continue;
    if (!makeMissing) {
      notes.push(`Upload-Post has no profile "${user}" any more.`);
      continue;
    }
    try {
      await createUploadPostProfile(saved.apiKey, user);
      profiles.push({ username: user, accounts: {} });
      notes.push(`Made the ${LANG_NAME[l]} profile "${user}" on Upload-Post.`);
    } catch (err) {
      notes.push(`Could not make the ${LANG_NAME[l]} profile "${user}": ${(err as Error).message}. Make it yourself on upload-post.com → Profiles, then press Refresh.`);
    }
  }
  const next: UploadPostSaved = {
    ...saved,
    platforms: { ne: [], en: [] },
    accounts: { ne: {}, en: {} },
    checkedAt: new Date().toISOString(),
  };
  for (const l of LANGS) {
    const p = profiles.find((x) => x.username === saved.users[l]);
    if (!p) continue;
    next.accounts![l] = p.accounts;
    next.platforms[l] = (Object.keys(p.accounts) as PlatformName[]).filter((k) => p.accounts[k]);
  }
  await prisma.appSetting.upsert({
    where: { workspaceId_key: { workspaceId, key: SETTING.uploadPost } },
    update: { value: lockSecret(JSON.stringify(next)) },
    create: { workspaceId, key: SETTING.uploadPost, value: lockSecret(JSON.stringify(next)) },
  });

  // One channel row per connected account (the upload queue and the Ready page use them).
  const sw = readSwitch(await getSetting(workspaceId, SETTING.uploadSwitch));
  const mode = sw === "auto" || sw === "practice" ? "AUTO" : "APPROVAL";
  for (const l of LANGS) {
    for (const p of next.platforms[l]) {
      const where = { workspaceId, platform: p.toUpperCase() as Platform, language: l as Language };
      const account = next.accounts![l]?.[p];
      const name = account && account !== "connected" ? account : `${NICE[p]} (${LANG_NAME[l]})`;
      const existing = await prisma.channel.findFirst({ where });
      // A channel connected with a direct Connect button keeps its own name.
      if (existing && !(existing.accessTokenEnc || existing.refreshTokenEnc)) await prisma.channel.update({ where: { id: existing.id }, data: { name } });
      if (!existing) await prisma.channel.create({ data: { ...where, name, mode } });
    }
  }
  return { saved: next, notes };
}

function summary(saved: UploadPostSaved): string {
  return LANGS.map((l) => {
    const list = saved.platforms[l].map((p) => NICE[p]);
    return `${LANG_NAME[l]}: ${list.length ? list.join(", ") : "no accounts connected yet"}`;
  }).join(". ");
}

export async function uploadPostRoutes(app: FastifyInstance) {
  app.post<{ Body: unknown }>("/connect/uploadpost/save", async (req, reply) => {
    const body = saveBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Check what you typed." });
    if (!secretBoxReady()) return reply.code(409).send({ error: "This server has no key to lock the API key with. Add R2_SECRET_ACCESS_KEY (same value as in GitHub Secrets) to the dashboard's settings." });
    const ws = await getDefaultWorkspace();
    const old = await loadUploadPost(ws.id);
    const apiKey = body.data.apiKey || old?.apiKey;
    if (!apiKey) return reply.code(400).send({ error: "Paste your Upload-Post API key first." });
    const users = {
      ne: body.data.userNe || old?.users.ne || UPLOAD_POST_DEFAULT_USERS.ne,
      en: body.data.userEn || old?.users.en || UPLOAD_POST_DEFAULT_USERS.en,
    };
    if (users.ne === users.en) return reply.code(400).send({ error: "Use two different profiles: one for Nepali, one for English." });
    try {
      const r = await checkAndSave(ws.id, { apiKey, users, platforms: { ne: [], en: [] } }, true);
      await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "uploadpost.saved", target: `${users.ne},${users.en}` } });
      return { ok: true, message: [`Saved. ${summary(r.saved)}.`, ...r.notes].join(" ") };
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message.slice(0, 400) });
    }
  });

  app.post("/connect/uploadpost/refresh", async (_req, reply) => {
    const ws = await getDefaultWorkspace();
    const saved = await loadUploadPost(ws.id);
    if (!saved) return reply.code(409).send({ error: "Save your Upload-Post API key first." });
    try {
      const r = await checkAndSave(ws.id, saved, true);
      return { ok: true, message: [`${summary(r.saved)}.`, ...r.notes].join(" ") };
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message.slice(0, 400) });
    }
  });

  app.post<{ Body: unknown }>("/connect/uploadpost/link", async (req, reply) => {
    const body = linkBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "The dashboard address must start with https://" });
    const ws = await getDefaultWorkspace();
    const saved = await loadUploadPost(ws.id);
    if (!saved) return reply.code(409).send({ error: "Save your Upload-Post API key first." });
    const user = saved.users[body.data.language];
    try {
      return { url: await uploadPostConnectLink(saved.apiKey, user, body.data.redirectUrl) };
    } catch (err) {
      return reply.code(422).send({
        error: `${(err as Error).message.slice(0, 300)} You can also connect on upload-post.com → Manage Users → "${user}" → Connect, then press Refresh here.`,
      });
    }
  });

  app.post("/connect/uploadpost/remove", async () => {
    const ws = await getDefaultWorkspace();
    await prisma.appSetting.deleteMany({ where: { workspaceId: ws.id, key: SETTING.uploadPost } });
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "uploadpost.removed", target: "-" } });
    return { ok: true };
  });
}
