/**
 * "My pictures": add your own photos or short clips to a story (Ready page) or to an idea before
 * its video is made (Ideas page). Your pictures always win over pictures the robot finds
 * (see apps/worker/src/steps/mypictures.ts). An idea's pictures are copied to its story at render time.
 *
 *   POST   /<stories|topics>/:id/my-pictures/start  -> a safe file key + an upload address (R2: straight from the browser)
 *   POST   /<stories|topics>/:id/my-pictures        -> add the arrived file to the list
 *   DELETE /<stories|topics>/:id/my-pictures/:n     -> take picture n (0, 1, 2...) off the list
 *   POST   /stories/:id/remake                      -> make the video again with the same script and voice (no AI writing)
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Prisma } from "@dualflow/db";
import { deleteFile, downloadUrlFor, fileSize, storageDriver, uploadUrlFor } from "@dualflow/storage";
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
/** Where the files of one story / idea live: "mypictures/<storyId>/" or "mypictures/topic-<topicId>/". */
export const myPicturesPrefix = (target: Target, id: string) => `mypictures/${target === "topics" ? `topic-${id}` : id}/`;
const keyPattern = (prefix: string) => new RegExp(`^${prefix}[a-f0-9]{16}\\.(jpg|png|webp|mp4)$`);
type Target = "stories" | "topics";

export type MyPicture = { key: string; kind: "image" | "video"; credit?: string; name?: string };
export const myPicturesOf = (value: unknown): MyPicture[] => (Array.isArray(value) ? (value as MyPicture[]).filter((m) => m && typeof m.key === "string") : []);

/** For the dashboard: number, kind, name, credit and a small preview address (photos only). */
export const myPictureRows = (value: unknown) =>
  Promise.all(
    myPicturesOf(value).map(async (m, n) => ({
      n,
      kind: m.kind,
      name: m.name ?? "",
      credit: m.credit ?? "",
      previewUrl: m.kind === "image" ? await downloadUrlFor(m.key, { inline: true }).catch(() => null) : null,
    })),
  );

const startSchema = z.object({ fileName: z.string().max(300), sizeBytes: z.number().int().positive(), contentType: z.string() });
const addSchema = z.object({ key: z.string(), credit: z.string().trim().max(120).default(""), name: z.string().trim().max(200).default("") });

export async function myPicturesRoutes(app: FastifyInstance) {
  /** Only stories of this workspace, and never your own uploaded finished videos. */
  const findStory = async (id: string) => {
    if (!ID.test(id)) return null;
    const ws = await getDefaultWorkspace();
    return prisma.story.findFirst({ where: { id, workspaceId: ws.id, topic: { source: { not: "UPLOAD" } } }, select: { id: true, myPictures: true } });
  };
  /** Ideas of this workspace (not uploaded finished videos). */
  const findTopic = async (id: string) => {
    if (!ID.test(id)) return null;
    const ws = await getDefaultWorkspace();
    return prisma.topic.findFirst({ where: { id, workspaceId: ws.id, source: { not: "UPLOAD" } }, select: { id: true, myPictures: true } });
  };
  const find = (target: Target, id: string) => (target === "topics" ? findTopic(id) : findStory(id));
  const save = (target: Target, id: string, list: MyPicture[]) => {
    const myPictures = list.length ? (list as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    return target === "topics" ? prisma.topic.update({ where: { id }, data: { myPictures } }) : prisma.story.update({ where: { id }, data: { myPictures } });
  };

  for (const target of ["stories", "topics"] as const) {
    const notFound = target === "topics" ? "Idea not found" : "Story not found";

    app.post<{ Params: { id: string } }>(`/${target}/:id/my-pictures/start`, async (req, reply) => {
      const row = await find(target, req.params.id);
      if (!row) return reply.code(404).send({ error: notFound });
      const parsed = startSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Bad request" });
      const type = TYPES[parsed.data.contentType];
      if (!type) return reply.code(400).send({ error: "Only .jpg, .png, .webp photos and .mp4 clips can be added." });
      if (parsed.data.sizeBytes > MAX_BYTES) return reply.code(400).send({ error: "That file is too big (60 MB at most)." });
      if (myPicturesOf(row.myPictures).length >= MAX_PICTURES) return reply.code(400).send({ error: `You can add ${MAX_PICTURES} pictures at most.` });
      if (storageDriver() !== "r2") return reply.code(409).send({ error: "My pictures need the Cloudflare R2 video storage." });
      const key = `${myPicturesPrefix(target, row.id)}${randomBytes(8).toString("hex")}.${type.ext}`;
      return { key, uploadUrl: await uploadUrlFor(key) };
    });

    app.post<{ Params: { id: string } }>(`/${target}/:id/my-pictures`, async (req, reply) => {
      const row = await find(target, req.params.id);
      if (!row) return reply.code(404).send({ error: notFound });
      const parsed = addSchema.safeParse(req.body);
      if (!parsed.success || !keyPattern(myPicturesPrefix(target, row.id)).test(parsed.data.key)) return reply.code(400).send({ error: "Bad file key" });
      const size = await fileSize(parsed.data.key);
      if (size === null) return reply.code(400).send({ error: "The file did not arrive. Please add it again." });
      if (size > MAX_BYTES) return reply.code(400).send({ error: "That file is too big (60 MB at most)." });
      const list = myPicturesOf(row.myPictures);
      if (list.length >= MAX_PICTURES) return reply.code(400).send({ error: `You can add ${MAX_PICTURES} pictures at most.` });
      const kind = parsed.data.key.endsWith(".mp4") ? "video" : "image";
      list.push({ key: parsed.data.key, kind, credit: parsed.data.credit || undefined, name: parsed.data.name || undefined });
      await save(target, row.id, list);
      return { ok: true, count: list.length };
    });

    app.delete<{ Params: { id: string; n: string } }>(`/${target}/:id/my-pictures/:n`, async (req, reply) => {
      const row = await find(target, req.params.id);
      if (!row) return reply.code(404).send({ error: notFound });
      const list = myPicturesOf(row.myPictures);
      const n = Number(req.params.n);
      if (!Number.isInteger(n) || n < 0 || n >= list.length) return reply.code(400).send({ error: "No such picture" });
      const [gone] = list.splice(n, 1);
      await save(target, row.id, list);
      // A story may use a file that came from its idea: only delete files in this row's own folder.
      if (gone && gone.key.startsWith(myPicturesPrefix(target, row.id))) await deleteFile(gone.key).catch(() => undefined);
      return { ok: true, count: list.length };
    });
  }

  /** Remake the video(s) of this story: same script and voice, pictures searched again (yours first). */
  app.post<{ Params: { id: string } }>("/stories/:id/remake", async (req, reply) => {
    const story = await findStory(req.params.id);
    if (!story) return reply.code(404).send({ error: "Story not found" });
    const run = await triggerPipelineRun(undefined, { full_video: `remake ${story.id}` });
    return run.started ? { ok: true, message: "Remake started. The new video is ready in about 30-90 minutes." } : reply.code(502).send({ error: run.message });
  });
}
