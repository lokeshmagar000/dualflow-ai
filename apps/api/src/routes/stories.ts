import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import { createStorySchema, JOB_NAMES, LANGUAGES } from "@dualflow/shared";
import { pipelineQueue } from "../queue";
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
        variants: { include: { scenes: { orderBy: { order: "asc" } } }, orderBy: { language: "asc" } },
      },
    });
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const cost = await prisma.costEvent.aggregate({ _sum: { usd: true }, where: { storyId: story.id } });
    return { ...story, costUsd: cost._sum.usd ?? 0 };
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
    await pipelineQueue.add(
      JOB_NAMES.research,
      { storyId: story.id, run: updated.run },
      { jobId: `research-${story.id}-${updated.run}` },
    );
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

    // jobId makes this safe: adding the same job twice does nothing.
    await pipelineQueue.add(
      JOB_NAMES.research,
      { storyId: story.id, run: story.run },
      { jobId: `research-${story.id}-${story.run}` },
    );

    return reply.code(201).send(story);
  });
}
