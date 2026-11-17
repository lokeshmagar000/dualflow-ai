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
      { storyId: story.id },
      { jobId: `research-${story.id}` },
    );

    return reply.code(201).send(story);
  });
}
