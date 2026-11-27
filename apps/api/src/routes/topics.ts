import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import { createTopicSchema } from "@dualflow/shared";
import { getDefaultWorkspace } from "../workspace";
import { myPictureRows } from "./mypictures";

export async function topicRoutes(app: FastifyInstance) {
  // List the newest topics first.
  app.get("/topics", async () => {
    const ws = await getDefaultWorkspace();
    const topics = await prisma.topic.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // "My pictures" added to a waiting idea, with small previews for the Ideas page.
    return Promise.all(
      topics.map(async ({ myPictures, ...t }) => ({ ...t, myPictures: t.status === "USED" ? [] : await myPictureRows(myPictures) })),
    );
  });

  // Add a new idea (from the chat assistant or typed by hand).
  app.post("/topics", async (req, reply) => {
    const parsed = createTopicSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const ws = await getDefaultWorkspace();
    const topic = await prisma.topic.create({
      data: {
        workspaceId: ws.id,
        title: parsed.data.title,
        notes: parsed.data.notes,
        source: parsed.data.source.toUpperCase() as "CHAT" | "TREND" | "DIRECTOR" | "MANUAL",
      },
    });
    return reply.code(201).send(topic);
  });
}
