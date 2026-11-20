/**
 * Bulk upload: send ONE finished video (made by you, not by the AI) to every platform at once.
 *
 * How it works (the browser page is apps/web/src/app/(dashboard)/bulk-upload):
 *   1. POST /bulk-uploads/start    -> we pick a safe file name ("key") and give the browser an
 *                                     upload address. With R2 it is a "presigned" address, so the
 *                                     video goes straight from the browser to R2.
 *   2. (local storage only) PUT /bulk-uploads/file?key=...  -> the API saves the file itself.
 *   3. POST /bulk-uploads          -> we check the file and each platform's limits, make a story
 *                                     with one video, and one upload row per channel you ticked.
 *                                     Then we start the small "Upload now" GitHub run.
 *   4. GET /bulk-uploads           -> the newest bulk uploads with each platform's result.
 *
 * The uploads themselves happen in GitHub Actions (that is where the channel tokens are).
 * Nepali videos can only go to Nepali channels, English videos to English channels.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Platform } from "@dualflow/db";
import { checkLimits, LIMITS, niceSize, pickFormat, type PlatformName } from "@dualflow/publish/limits";
import { fileSize, saveFile, storageDriver, uploadUrlFor } from "@dualflow/storage";
import { githubRunConfigured, startUploadRun } from "../github";
import { getDefaultWorkspace } from "../workspace";

/** Only these file types: every platform accepts them. */
const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
/** Keys we hand out look like "uploads/<random letters>/video.mp4". Nothing else is accepted. */
const KEY_PATTERN = /^uploads\/[a-f0-9]{24}\/video\.(mp4|mov)$/;

const startSchema = z.object({
  fileName: z.string().max(300),
  sizeBytes: z.number().int().positive(),
  contentType: z.string(),
});

const createSchema = z.object({
  key: z.string().regex(KEY_PATTERN),
  language: z.enum(["ne", "en"]),
  title: z.string().trim().min(1, "Write a title").max(100),
  caption: z.string().trim().max(2200).default(""),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  durationSec: z.number().positive().max(24 * 3600).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  channelIds: z.array(z.string()).min(1, "Tick at least one platform"),
});

const toName = (p: Platform) => p.toLowerCase() as PlatformName;

export async function bulkRoutes(app: FastifyInstance) {
  // Local storage only: let the API accept a raw video in the request body (up to the page limit).
  for (const type of Object.keys(EXTENSIONS)) {
    app.addContentTypeParser(type, { parseAs: "buffer", bodyLimit: LIMITS.pageMaxBytes }, (_req, body, done) => done(null, body));
  }

  /** What the page needs to draw itself: your channels and how files are stored. */
  app.get("/bulk-uploads/setup", async () => {
    const ws = await getDefaultWorkspace();
    const channels = await prisma.channel.findMany({
      where: { workspaceId: ws.id },
      orderBy: [{ language: "asc" }, { platform: "asc" }],
      select: { id: true, platform: true, language: true, name: true },
    });
    return { channels, storage: storageDriver(), uploadRunReady: githubRunConfigured(), limits: LIMITS };
  });

  /** Step 1: a key and an upload address for one new video. */
  app.post("/bulk-uploads/start", async (req, reply) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad request" });
    const { sizeBytes, contentType } = parsed.data;
    const ext = EXTENSIONS[contentType];
    if (!ext) return reply.code(400).send({ error: "Only .mp4 and .mov videos can be sent." });
    if (sizeBytes > LIMITS.pageMaxBytes) {
      return reply.code(400).send({ error: `The video is ${niceSize(sizeBytes)}. The most this page takes is ${niceSize(LIMITS.pageMaxBytes)}.` });
    }
    // randomBytes = unguessable letters, so nobody can guess another upload's address.
    const key = `uploads/${randomBytes(12).toString("hex")}/video.${ext}`;
    const uploadUrl = await uploadUrlFor(key); // null with local storage
    return { key, uploadUrl };
  });

  /** Step 2 (local storage only): the browser sends the video here (through the dashboard). */
  app.put<{ Querystring: { key?: string } }>("/bulk-uploads/file", async (req, reply) => {
    if (storageDriver() === "r2") return reply.code(409).send({ error: "With R2 the browser uploads straight to R2." });
    const key = String(req.query.key ?? "");
    if (!KEY_PATTERN.test(key)) return reply.code(400).send({ error: "Bad file key" });
    if ((await fileSize(key)) !== null) return reply.code(409).send({ error: "This file was already sent." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return reply.code(400).send({ error: "Empty file" });
    await saveFile(key, req.body);
    return { ok: true };
  });

  /** Step 3: check everything, make the story and the uploads, and start the upload run. */
  app.post("/bulk-uploads", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(" ") });
    }
    const input = parsed.data;
    const ws = await getDefaultWorkspace();

    // Is the video really there, and how big is it? (We trust our storage, not the browser.)
    const sizeBytes = await fileSize(input.key);
    if (sizeBytes === null) return reply.code(400).send({ error: "The video did not arrive. Please send it again." });
    if (sizeBytes > LIMITS.pageMaxBytes) return reply.code(400).send({ error: `The video is too big (${niceSize(sizeBytes)}).` });

    // Only channels of THIS language: Nepali videos never go to the English channels.
    const channels = await prisma.channel.findMany({ where: { workspaceId: ws.id, id: { in: input.channelIds }, language: input.language } });
    if (channels.length === 0) return reply.code(400).send({ error: "None of the ticked channels are for this language." });

    const facts = { sizeBytes, durationSec: input.durationSec, width: input.width, height: input.height };
    const format = pickFormat(facts);

    // One "story" with one video. Topic source UPLOAD tells the worker: only the channels you ticked.
    const story = await prisma.$transaction(async (tx) => {
      const topic = await tx.topic.create({ data: { workspaceId: ws.id, title: input.title, source: "UPLOAD", status: "USED" } });
      const s = await tx.story.create({
        data: {
          workspaceId: ws.id,
          topicId: topic.id,
          format,
          status: "SCHEDULED",
          visualPlan: { upload: { width: input.width, height: input.height, sizeBytes } },
        },
      });
      const variant = await tx.variant.create({
        data: {
          storyId: s.id,
          language: input.language,
          title: input.title,
          description: input.caption,
          hashtags: input.hashtags.map((h) => h.replace(/^#+/, "")).filter(Boolean),
          durationSec: input.durationSec,
          outputKey: input.key,
          status: "SCHEDULED",
        },
      });
      const now = new Date();
      for (const ch of channels) {
        // A platform that would refuse the video is marked "failed" now, with the reason,
        // so you see it on the page. The other platforms still get the video.
        const limits = checkLimits(toName(ch.platform), facts);
        await tx.publication.create({
          data: limits.ok
            ? { variantId: variant.id, channelId: ch.id, status: "SCHEDULED", scheduledAt: now }
            : { variantId: variant.id, channelId: ch.id, status: "FAILED", error: `Not sent: ${limits.problems.join(" ")}` },
        });
      }
      return s;
    });

    const message = await startUploadRun(req.log);
    return reply.code(201).send({ storyId: story.id, message });
  });

  /** The newest bulk uploads, each with every platform's result. */
  app.get("/bulk-uploads", async () => {
    const ws = await getDefaultWorkspace();
    return prisma.story.findMany({
      where: { workspaceId: ws.id, topic: { source: "UPLOAD" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        format: true,
        createdAt: true,
        variants: {
          select: {
            id: true,
            language: true,
            title: true,
            durationSec: true,
            publications: {
              select: { id: true, status: true, postUrl: true, error: true, attempts: true, publishedAt: true, scheduledAt: true, channel: { select: { name: true, platform: true } } },
              orderBy: { channel: { platform: "asc" } },
            },
          },
        },
      },
    });
  });

  /** "Upload now" button: start the small upload run again (e.g. after turning publishing on). */
  app.post("/bulk-uploads/run", async (req) => {
    return { message: await startUploadRun(req.log) };
  });
}
