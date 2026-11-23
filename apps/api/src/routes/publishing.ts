/**
 * Uploads to social channels: the queue, approving, "Upload now" and retrying.
 *
 * The uploads themselves happen in the GitHub Actions run (the worker),
 * because that is where the channel tokens (GitHub Secrets) are.
 * These routes only change the queue in the database, then start a run.
 */
import type { FastifyInstance } from "fastify";
import { prisma, type Variant } from "@dualflow/db";
import { readSwitch, SETTING } from "@dualflow/publish";
import { startUploadRun } from "../github";
import { getDefaultWorkspace } from "../workspace";

export async function publishingRoutes(app: FastifyInstance) {
  /** The channels the worker found settings for (one per platform + language). */
  app.get("/channels", async () => {
    const ws = await getDefaultWorkspace();
    const channels = await prisma.channel.findMany({
      where: { workspaceId: ws.id },
      orderBy: [{ platform: "asc" }, { language: "asc" }],
      select: { id: true, platform: true, language: true, name: true, mode: true, updatedAt: true },
    });
    const counts = await prisma.publication.groupBy({
      by: ["channelId", "status"],
      where: { channel: { workspaceId: ws.id } },
      _count: true,
    });
    return channels.map((c) => ({
      ...c,
      counts: Object.fromEntries(counts.filter((n) => n.channelId === c.id).map((n) => [n.status, n._count])),
    }));
  });

  /** The upload queue: waiting, scheduled, uploading, failed and recent uploads. */
  app.get("/publications", async () => {
    const ws = await getDefaultWorkspace();
    return prisma.publication.findMany({
      where: { channel: { workspaceId: ws.id } },
      include: {
        channel: { select: { name: true, platform: true, language: true } },
        variant: { select: { id: true, title: true, language: true, story: { select: { id: true, topic: { select: { title: true } } } } } },
      },
      orderBy: [{ scheduledAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 200,
    });
  });

  /** Approval mode: approve both videos of a story. They get the next free time slots. */
  app.post<{ Params: { id: string } }>("/stories/:id/approve", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const story = await prisma.story.findFirst({ where: { id: req.params.id, workspaceId: ws.id }, include: { variants: true } });
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const variantIds = story.variants.map((v) => v.id);
    // scheduledAt = null means "the next free slot"; the worker picks the time.
    const res = await prisma.publication.updateMany({
      where: { variantId: { in: variantIds }, status: "READY" },
      data: { status: "SCHEDULED", scheduledAt: null },
    });
    await prisma.approval.createMany({ data: variantIds.map((variantId) => ({ variantId, approved: true })) });
    await prisma.variant.updateMany({ where: { id: { in: variantIds }, status: "READY" }, data: { status: "SCHEDULED" } });
    await prisma.story.updateMany({ where: { id: story.id, status: "READY" }, data: { status: "SCHEDULED" } });
    return { ok: true, approved: res.count };
  });

  /** Upload both videos of a story to every channel of its language, now (works in every mode). */
  app.post<{ Params: { id: string } }>("/stories/:id/upload-now", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const story = await prisma.story.findFirst({ where: { id: req.params.id, workspaceId: ws.id }, include: { variants: true } });
    if (!story) return reply.code(404).send({ error: "Story not found" });
    return sendUploads(ws.id, story.variants, req.log, reply);
  });

  /** The "Upload to my channels" button of ONE video (one language) on Ready to upload. */
  app.post<{ Params: { id: string } }>("/variants/:id/upload-now", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const v = await prisma.variant.findFirst({ where: { id: req.params.id, story: { workspaceId: ws.id } } });
    if (!v) return reply.code(404).send({ error: "Video not found" });
    return sendUploads(ws.id, [v], req.log, reply);
  });

  /** "Upload all": every video still waiting on Ready to upload. */
  app.post("/ready/upload-all", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const variants = await prisma.variant.findMany({
      where: {
        outputKey: { not: null },
        manualUploadedAt: null,
        story: { workspaceId: ws.id, status: { in: ["READY", "APPROVED", "SCHEDULED"] }, topic: { source: { not: "UPLOAD" } } },
      },
      orderBy: { createdAt: "asc" }, // oldest first
      take: 100,
    });
    if (variants.length === 0) return reply.code(409).send({ error: "No video is waiting." });
    return sendUploads(ws.id, variants, req.log, reply);
  });

  /** Try a failed upload again, now. */
  app.post<{ Params: { id: string } }>("/publications/:id/retry", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const pub = await prisma.publication.findFirst({ where: { id: req.params.id, channel: { workspaceId: ws.id } } });
    if (!pub) return reply.code(404).send({ error: "Upload not found" });
    if (pub.status !== "FAILED") return reply.code(409).send({ error: "Only failed uploads can be retried." });
    await prisma.publication.update({ where: { id: pub.id }, data: { status: "SCHEDULED", scheduledAt: new Date(), attempts: 0, error: null } });
    await startUploadRun(req.log); // the small "Upload now" run, not the whole pipeline
    return { ok: true };
  });
}

/**
 * The channels the Upload buttons send to.
 * If you connected channels with the dashboard's Connect buttons, only those (a channel you
 * removed is skipped). Old setup (tokens only in GitHub Secrets): every channel row.
 */
async function uploadTargets(workspaceId: string) {
  const all = await prisma.channel.findMany({ where: { workspaceId } });
  const connected = all.filter((c) => c.accessTokenEnc || c.refreshTokenEnc);
  return connected.length > 0 ? connected : all;
}

type Log = { warn: (msg: string) => void };
type Reply = { code: (n: number) => { send: (b: unknown) => unknown } };

/**
 * Put these videos in the upload queue for "now", each only on the channels of ITS language
 * (Nepali video -> Nepali channels), then start the small "Upload now" run.
 */
async function sendUploads(workspaceId: string, variants: Variant[], log: Log, reply: Reply) {
  const channels = await uploadTargets(workspaceId);
  if (channels.length === 0) return reply.code(409).send({ error: "No channels yet. Open Channels and press Connect first." });

  // The buttons need publishing to be on. Never used the switch? Set it to "Off" = nothing
  // uploads by itself, but buttons work. (The GitHub variables were off by default.)
  const sw = await prisma.appSetting.findUnique({ where: { workspaceId_key: { workspaceId, key: SETTING.uploadSwitch } } });
  let mode = readSwitch(sw?.value);
  if (!mode) {
    await prisma.appSetting.create({ data: { workspaceId, key: SETTING.uploadSwitch, value: JSON.stringify({ mode: "off" }) } });
    mode = "off";
  }

  const now = new Date();
  let queued = 0;
  let skippedNoFile = 0;
  const where = new Set<string>();
  const storyIds = new Set<string>();
  for (const v of variants) {
    if (!v.outputKey) {
      skippedNoFile++;
      continue;
    }
    for (const ch of channels.filter((c) => c.language === v.language)) {
      const existing = await prisma.publication.findUnique({ where: { variantId_channelId: { variantId: v.id, channelId: ch.id } } });
      if (existing?.status === "PUBLISHED" || existing?.status === "GENERATING") continue;
      await prisma.publication.upsert({
        where: { variantId_channelId: { variantId: v.id, channelId: ch.id } },
        update: { status: "SCHEDULED", scheduledAt: now, attempts: 0, error: null },
        create: { variantId: v.id, channelId: ch.id, status: "SCHEDULED", scheduledAt: now },
      });
      queued++;
      where.add(ch.name);
      storyIds.add(v.storyId);
    }
  }
  if (queued === 0) {
    const why = skippedNoFile ? "the video file was deleted to save storage" : "it is already uploaded (or uploading) on every connected channel of its language";
    return reply.code(409).send({ error: `Nothing to upload: ${why}.` });
  }
  await prisma.variant.updateMany({ where: { id: { in: variants.map((v) => v.id) }, status: "READY" }, data: { status: "SCHEDULED" } });
  await prisma.story.updateMany({ where: { id: { in: [...storyIds] }, status: "READY" }, data: { status: "SCHEDULED" } });
  const run = await startUploadRun(log); // the small "Upload now" run, not the whole pipeline
  const practice = mode === "practice" ? " Note: Auto upload is on Practice, so nothing is really posted. Pick another setting on Channels." : "";
  const yt = channels.some((c) => c.platform === "YOUTUBE") ? " YouTube keeps it private until Google's audit says yes." : "";
  return { ok: true, queued, message: `${queued} upload(s) added (${[...where].join(", ")}). ${run}${yt}${practice}` };
}
