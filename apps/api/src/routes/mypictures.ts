/**
 * "My pictures": add your own photos or short clips to a story, then remake its video with them.
 * Your pictures always win over pictures the robot finds (see apps/worker/src/steps/mypictures.ts).
 *
 *   POST   /stories/:id/my-pictures/start  -> a safe file key + an upload address (R2: straight from the browser)
 *   POST   /stories/:id/my-pictures        -> add the arrived file to the story's list
 *   DELETE /stories/:id/my-pictures/:n     -> take picture n (0, 1, 2...) off the list
 *   POST   /stories/:id/remake             -> make the video again with the same script and voice (no AI writing)
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Prisma } from "@dualflow/db";
import { deleteFile, fileSize, storageDriver, uploadUrlFor } from "@dualflow/storage";
import { triggerPipelineRun } from "../github";
import { getDefaultWorkspace } from "../workspace";

/** Photos and short clips only. */
const TYPES: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
};
const MAX_BYTES = 60 * 1024 * 1024;
export const MAX_PICTURES = 15;
const ID = /^[a-z0-9]{10,40}$/i;
const keyPattern = (storyId: string) => new RegExp(`^mypictures/${storyId}/[a-f0-9]{16}\\.(jpg|png|webp|mp4)$`);

export type MyPicture = { key: string; kind: "image" | "video"; credit?: string; name?: string };
export const myPicturesOf = (value: unknown): MyPicture[] => (Array.isArray(value) ? (value as MyPicture[]).filter((m) => m && typeof m.key === "string") : []);

const startSchema = z.object({ fileName: z.string().max(300), sizeBytes: z.number().int().positive(), contentType: z.string() });
const addSchema = z.object({ key: z.string(), credit: z.string().trim().max(120).default(""), name: z.string().trim().max(200).default("") });

export async function myPicturesRoutes(app: FastifyInstance) {
  /** Only stories of this workspace, and never your own uploaded finished videos. */
  const findStory = async (id: string) => {
    if (!ID.test(id)) return null;
    const ws = await getDefaultWorkspace();
    return prisma.story.findFirst({ where: { id, workspaceId: ws.id, topic: { source: { not: "UPLOAD" } } }, select: { id: true, myPictures: true } });
  };

  app.post<{ Params: { id: string } }>("/stories/:id/my-pictures/start", async (req, reply) => {
    const story = await findStory(req.params.id);
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad request" });
    const type = TYPES[parsed.data.contentType];
    if (!type) return reply.code(400).send({ error: "Only .jpg, .png, .webp photos and .mp4 clips can be added." });
    if (parsed.data.sizeBytes > MAX_BYTES) return reply.code(400).send({ error: "That file is too big (60 MB at most)." });
    if (myPicturesOf(story.myPictures).length >= MAX_PICTURES) return reply.code(400).send({ error: `A story can have ${MAX_PICTURES} pictures at most.` });
    if (storageDriver() !== "r2") return reply.code(409).send({ error: "My pictures need the Cloudflare R2 video storage." });
    const key = `mypictures/${story.id}/${randomBytes(8).toString("hex")}.${type.ext}`;
    return { key, uploadUrl: await uploadUrlFor(key) };
  });

  app.post<{ Params: { id: string } }>("/stories/:id/my-pictures", async (req, reply) => {
    const story = await findStory(req.params.id);
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success || !keyPattern(story.id).test(parsed.data.key)) return reply.code(400).send({ error: "Bad file key" });
    const size = await fileSize(parsed.data.key);
    if (size === null) return reply.code(400).send({ error: "The file did not arrive. Please add it again." });
    if (size > MAX_BYTES) return reply.code(400).send({ error: "That file is too big (60 MB at most)." });
    const list = myPicturesOf(story.myPictures);
    if (list.length >= MAX_PICTURES) return reply.code(400).send({ error: `A story can have ${MAX_PICTURES} pictures at most.` });
    const kind = parsed.data.key.endsWith(".mp4") ? "video" : "image";
    list.push({ key: parsed.data.key, kind, credit: parsed.data.credit || undefined, name: parsed.data.name || undefined });
    await prisma.story.update({ where: { id: story.id }, data: { myPictures: list as unknown as Prisma.InputJsonValue } });
    return { ok: true, count: list.length };
  });

  app.delete<{ Params: { id: string; n: string } }>("/stories/:id/my-pictures/:n", async (req, reply) => {
    const story = await findStory(req.params.id);
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const list = myPicturesOf(story.myPictures);
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 0 || n >= list.length) return reply.code(400).send({ error: "No such picture" });
    const [gone] = list.splice(n, 1);
    await prisma.story.update({ where: { id: story.id }, data: { myPictures: list.length ? (list as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
    if (gone) await deleteFile(gone.key).catch(() => undefined);
    return { ok: true, count: list.length };
  });

  /** Remake the video(s) of this story: same script and voice, pictures searched again (yours first). */
  app.post<{ Params: { id: string } }>("/stories/:id/remake", async (req, reply) => {
    const story = await findStory(req.params.id);
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const run = await triggerPipelineRun(undefined, { full_video: `remake ${story.id}` });
    return run.started ? { ok: true, message: "Remake started. The new video is ready in about 30-90 minutes." } : reply.code(502).send({ error: run.message });
  });
}
