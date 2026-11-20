/**
 * Uploads to social channels: the queue, approving, "Upload now" and retrying.
 *
 * The uploads themselves happen in the GitHub Actions run (the worker),
 * because that is where the channel tokens (GitHub Secrets) are.
 * These routes only change the queue in the database, then start a run.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
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

  /** Upload both videos of a story to every channel now (works in every mode). */
  app.post<{ Params: { id: string } }>("/stories/:id/upload-now", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const story = await prisma.story.findFirst({ where: { id: req.params.id, workspaceId: ws.id }, include: { variants: true } });
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const channels = await prisma.channel.findMany({ where: { workspaceId: ws.id } });
    if (channels.length === 0) return reply.code(409).send({ error: "No channels yet. Add the channel secrets in GitHub and run 'Test my channels' first." });
    const now = new Date();
    let queued = 0;
    for (const v of story.variants.filter((v) => v.outputKey)) {
      for (const ch of channels.filter((c) => c.language === v.language)) {
        const existing = await prisma.publication.findUnique({ where: { variantId_channelId: { variantId: v.id, channelId: ch.id } } });
        if (existing?.status === "PUBLISHED" || existing?.status === "GENERATING") continue;
        await prisma.publication.upsert({
          where: { variantId_channelId: { variantId: v.id, channelId: ch.id } },
          update: { status: "SCHEDULED", scheduledAt: now, attempts: 0, error: null },
          create: { variantId: v.id, channelId: ch.id, status: "SCHEDULED", scheduledAt: now },
        });
        queued++;
      }
    }
    if (queued === 0) return reply.code(409).send({ error: "Nothing to upload (no finished video, or already uploaded)." });
    await prisma.variant.updateMany({ where: { storyId: story.id, status: "READY" }, data: { status: "SCHEDULED" } });
    await prisma.story.updateMany({ where: { id: story.id, status: "READY" }, data: { status: "SCHEDULED" } });
    await startUploadRun(req.log); // the small "Upload now" run, not the whole pipeline
    return { ok: true, queued };
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
