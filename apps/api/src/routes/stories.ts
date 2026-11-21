import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import { createStorySchema, JOB_NAMES, LANGUAGES } from "@dualflow/shared";
import { buildCues, type WordTiming } from "@dualflow/voice";
import { contentTypeFor, deleteFile, fileExists, listFiles, readFile } from "@dualflow/storage";
import { enqueue } from "../queue";
import { triggerQuietly } from "../github";
import { getDefaultWorkspace } from "../workspace";

export async function storyRoutes(app: FastifyInstance) {
  app.get("/stories", async () => {
    const ws = await getDefaultWorkspace();
    return prisma.story.findMany({
      where: { workspaceId: ws.id },
      include: { topic: true, variants: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  // One story with both languages, their scenes, and the research facts.
  app.get<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const story = await prisma.story.findFirst({
      where: { id: req.params.id, workspaceId: ws.id },
      include: {
        topic: { include: { researchNotes: true } },
        variants: {
          include: {
            scenes: { orderBy: { order: "asc" } },
            voiceovers: { orderBy: { createdAt: "desc" }, take: 1 },
            publications: { include: { channel: { select: { name: true, platform: true } } }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { language: "asc" },
        },
      },
    });
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const cost = await prisma.costEvent.aggregate({ _sum: { usd: true }, where: { storyId: story.id } });

    // Instead of sending every word time, send ready-made subtitle lines (cues)
    // so the dashboard can show live subtitles under the audio player.
    const variants = story.variants.map(({ voiceovers, ...v }) => {
      const vo = voiceovers[0];
      return {
        ...v,
        voice: vo
          ? {
              provider: vo.provider,
              voice: vo.voice,
              cues: buildCues((vo.wordTimings ?? []) as unknown as WordTiming[]),
            }
          : null,
      };
    });
    return { ...story, variants, costUsd: cost._sum.usd ?? 0 };
  });

  /**
   * Send one file of a variant: its voice (audio), or its subtitles (srt / vtt).
   * We look the file up in the database, so a visitor can only get files
   * that really belong to a story in this workspace.
   */
  app.get<{ Params: { id: string; file: string } }>("/variants/:id/files/:file", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const variant = await prisma.variant.findFirst({
      where: { id: req.params.id, story: { workspaceId: ws.id } },
      include: {
        voiceovers: { orderBy: { createdAt: "desc" }, take: 1 },
        subtitles: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!variant) return reply.code(404).send({ error: "Variant not found" });

    const srtKey = variant.subtitles[0]?.storageKey;
    const keys: Record<string, string | undefined> = {
      audio: variant.voiceovers[0]?.storageKey,
      srt: srtKey,
      vtt: srtKey?.replace(/\.srt$/, ".vtt"), // the .vtt file sits next to the .srt
    };
    const key = keys[req.params.file];
    if (!key || !(await fileExists(key))) return reply.code(404).send({ error: "File not found" });

    const name = `${variant.language}-${req.params.file === "audio" ? "voice.wav" : `subtitles.${req.params.file}`}`;
    return reply
      .header("content-type", contentTypeFor(key))
      .header("content-disposition", `inline; filename="${name}"`)
      .send(await readFile(key));
  });

  /**
   * The "Delete" button: removes a story for good, with BOTH languages.
   *   1. its files in storage (videos, voices, subtitles, thumbnails),
   *   2. its jobs still waiting in the queue,
   *   3. the story itself (the database then removes its variants, scenes and uploads too).
   * The topic stays (marked "used"), so the AI does not pick the same topic again.
   */
  app.delete<{ Params: { id: string } }>("/stories/:id", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const story = await prisma.story.findFirst({
      where: { id: req.params.id, workspaceId: ws.id },
      select: { id: true, topic: { select: { title: true } } },
    });
    if (!story) return reply.code(404).send({ error: "Story not found" });

    // All files of a story live under "stories/<storyId>/".
    // Removing files is "best effort": if storage has a problem (wrong R2 key, slow network),
    // we still delete the story, so the Delete button always works. Leftover files only use space.
    let files = 0;
    let filesProblem: string | null = null;
    try {
      for (const file of await listFiles(`stories/${story.id}/`)) {
        await deleteFile(file.key);
        files++;
      }
    } catch (e) {
      filesProblem = e instanceof Error ? e.message : String(e);
      req.log.warn({ storyId: story.id, err: filesProblem }, "could not remove all files of a deleted story");
    }
    await prisma.pipelineJob.deleteMany({ where: { storyId: story.id } });
    await prisma.story.delete({ where: { id: story.id } });
    await prisma.auditLog.create({
      data: { workspaceId: ws.id, actor: "owner", action: "story.deleted", target: `${story.id} ${story.topic.title}`.slice(0, 250) },
    });
    return { ok: true, deletedFiles: files, filesProblem };
  });

  /** Run the whole pipeline again for a failed story. */
  app.post<{ Params: { id: string } }>("/stories/:id/retry", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const story = await prisma.story.findFirst({ where: { id: req.params.id, workspaceId: ws.id } });
    if (!story) return reply.code(404).send({ error: "Story not found" });

    // A new "run" number gives every job a new id, so finished jobs from
    // the last run don't block the new ones.
    const updated = await prisma.story.update({
      where: { id: story.id },
      data: { status: "GENERATING", lastError: null, run: { increment: 1 } },
    });
    await prisma.variant.updateMany({ where: { storyId: story.id }, data: { status: "DRAFT", lastError: null } });
    await enqueue(JOB_NAMES.research, { storyId: story.id, run: updated.run });
    await triggerQuietly(req.log); // free plan: start a GitHub Actions run now
    return { ok: true, run: updated.run };
  });

  /**
   * Turn a topic into a Story with TWO variants (Nepali + English),
   * then queue the first pipeline step (research).
   */
  app.post("/stories", async (req, reply) => {
    const parsed = createStorySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const ws = await getDefaultWorkspace();
    const topic = await prisma.topic.findFirst({
      where: { id: parsed.data.topicId, workspaceId: ws.id },
    });
    if (!topic) return reply.code(404).send({ error: "Topic not found" });

    // Check the kill switch before starting paid work.
    const paused = await prisma.budget.findFirst({ where: { workspaceId: ws.id, paused: true } });
    if (paused) return reply.code(409).send({ error: "Automation is paused" });

    const story = await prisma.story.create({
      data: {
        workspaceId: ws.id,
        topicId: topic.id,
        format: parsed.data.format === "long" ? "LONG" : "SHORT",
        status: "GENERATING",
        // One variant per language, created together.
        variants: { create: LANGUAGES.map((language) => ({ language })) },
      },
      include: { variants: true },
    });
    await prisma.topic.update({ where: { id: topic.id }, data: { status: "USED" } });

    // The job key makes this safe: adding the same job twice does nothing.
    await enqueue(JOB_NAMES.research, { storyId: story.id, run: story.run });
    await triggerQuietly(req.log); // free plan: start a GitHub Actions run now

    return reply.code(201).send(story);
  });
}
