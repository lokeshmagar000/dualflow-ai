/**
 * "Ready to upload" page: finished videos you download and upload yourself.
 *
 *   GET  /ready?show=waiting|uploaded|all   finished stories, newest first
 *   GET  /variants/:id/download/:kind       video, thumbnail or srt (?inline=1 to play/show it)
 *   POST /variants/:id/uploaded             { uploaded: true | false } = the "Mark as uploaded" button
 */
import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@dualflow/db";
import { contentTypeFor, downloadUrlFor, fileExists, readFile } from "@dualflow/storage";
import { getDefaultWorkspace } from "../workspace";

const KINDS = ["video", "thumbnail", "srt"] as const;
type Kind = (typeof KINDS)[number];

/** "Why Mount Everest grows!" -> "why-mount-everest-grows" (letters a-z and numbers only). */
export function slugify(text: string, max = 50): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return slug || "video";
}

/** e.g. "2026-11-20-en-why-mount-everest-grows.mp4". Nepali titles use the English title for the name. */
export function downloadName(opts: { createdAt: Date; language: string; englishTitle: string; kind: Kind }): string {
  const ext = { video: "mp4", thumbnail: "jpg", srt: "srt" }[opts.kind];
  const extra = opts.kind === "thumbnail" ? "-thumbnail" : opts.kind === "srt" ? "-subtitles" : "";
  return `${opts.createdAt.toISOString().slice(0, 10)}-${opts.language}-${slugify(opts.englishTitle)}${extra}.${ext}`;
}

export async function readyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { show?: string } }>("/ready", async (req) => {
    const ws = await getDefaultWorkspace();
    const show = req.query.show ?? "waiting";
    const variantFilter: Prisma.VariantWhereInput =
      show === "uploaded"
        ? { manualUploadedAt: { not: null } }
        : show === "all"
          ? {}
          : { manualUploadedAt: null, outputKey: { not: null } };
    return prisma.story.findMany({
      where: {
        workspaceId: ws.id,
        status: { in: ["READY", "APPROVED", "SCHEDULED", "PUBLISHED"] },
        topic: { source: { not: "UPLOAD" } }, // bulk uploads are your own videos
        variants: { some: variantFilter },
      },
      include: {
        topic: { select: { title: true, source: true } },
        variants: {
          orderBy: { language: "asc" }, // "en" first, then "ne"
          select: {
            id: true,
            language: true,
            title: true,
            description: true,
            hashtags: true,
            durationSec: true,
            outputKey: true,
            manualUploadedAt: true,
            thumbnails: { select: { id: true }, take: 1 },
            subtitles: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
  });

  app.get<{ Params: { id: string; kind: string }; Querystring: { inline?: string } }>(
    "/variants/:id/download/:kind",
    async (req, reply) => {
      const kind = req.params.kind as Kind;
      if (!KINDS.includes(kind)) return reply.code(404).send({ error: "Unknown file" });
      const ws = await getDefaultWorkspace();
      // Look the file up in the database: only files of stories in this workspace can be downloaded.
      const variant = await prisma.variant.findFirst({
        where: { id: req.params.id, story: { workspaceId: ws.id } },
        include: {
          thumbnails: { orderBy: { createdAt: "desc" }, take: 1 },
          subtitles: { orderBy: { createdAt: "desc" }, take: 1 },
          story: { select: { createdAt: true, topic: { select: { title: true } }, variants: { select: { language: true, title: true } } } },
        },
      });
      if (!variant) return reply.code(404).send({ error: "Video not found" });
      const key = { video: variant.outputKey, thumbnail: variant.thumbnails[0]?.storageKey, srt: variant.subtitles[0]?.storageKey }[kind];
      if (!key) return reply.code(404).send({ error: "File not made yet, or already deleted" });

      const englishTitle = variant.story.variants.find((v) => v.language === "en")?.title || variant.story.topic.title;
      const fileName = downloadName({ createdAt: variant.story.createdAt, language: variant.language, englishTitle, kind });
      const inline = req.query.inline === "1";

      // Cloudflare R2: send a short-lived download address; the browser gets the file straight from R2.
      const url = await downloadUrlFor(key, { fileName, inline });
      if (url) return { url };

      // Files on this computer: send the file itself.
      if (!(await fileExists(key))) return reply.code(404).send({ error: "File already deleted" });
      return reply
        .header("content-type", contentTypeFor(key))
        .header("content-disposition", `${inline ? "inline" : "attachment"}; filename="${fileName}"`)
        .send(await readFile(key));
    },
  );

  app.post<{ Params: { id: string }; Body: { uploaded?: boolean } }>("/variants/:id/uploaded", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const variant = await prisma.variant.findFirst({ where: { id: req.params.id, story: { workspaceId: ws.id } } });
    if (!variant) return reply.code(404).send({ error: "Video not found" });
    const uploaded = req.body?.uploaded !== false;
    const updated = await prisma.variant.update({
      where: { id: variant.id },
      data: { manualUploadedAt: uploaded ? new Date() : null },
      select: { id: true, manualUploadedAt: true },
    });
    await prisma.auditLog.create({
      data: { workspaceId: ws.id, actor: "owner", action: uploaded ? "video.marked_uploaded" : "video.unmarked_uploaded", target: variant.id },
    });
    return updated;
  });
}
