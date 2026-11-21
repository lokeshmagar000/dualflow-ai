/**
 * "Ready to upload" page: finished videos you download and upload yourself.
 *
 *   GET  /ready?show=waiting|uploaded|all&page=1   finished stories, newest first, 10 per page
 *   GET  /ready/zip?show=waiting|uploaded|all      "Download all": every video of that tab in one .zip
 *   GET  /variants/:id/download/:kind              video, thumbnail or srt (?inline=1 to play/show it)
 *   POST /variants/:id/uploaded                    { uploaded: true | false } = the "Mark as uploaded" button
 */
import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import { prisma, type Prisma } from "@dualflow/db";
import { contentTypeFor, downloadUrlFor, fileExists, readFile, readStream } from "@dualflow/storage";
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

/** How many stories one page shows. Fewer stories = a faster page. */
export const PAGE_SIZE = 10;
/** The most videos one "Download all" zip holds (keeps the free server from running for hours). */
export const ZIP_MAX_VIDEOS = 40;

/** Which videos each tab shows. */
function variantFilterFor(show: string): Prisma.VariantWhereInput {
  if (show === "uploaded") return { manualUploadedAt: { not: null } };
  if (show === "all") return {};
  return { manualUploadedAt: null, outputKey: { not: null } }; // "waiting"
}

/** Finished stories of this workspace (not bulk uploads) that have a video matching the tab. */
function storyFilterFor(workspaceId: string, show: string): Prisma.StoryWhereInput {
  return {
    workspaceId,
    status: { in: ["READY", "APPROVED", "SCHEDULED", "PUBLISHED"] },
    topic: { source: { not: "UPLOAD" } }, // bulk uploads are your own videos
    variants: { some: variantFilterFor(show) },
  };
}

/** The text file put next to each video in the zip: title, description and hashtags, ready to paste. */
export function uploadText(v: { title: string | null; description: string | null; hashtags: string[] }): string {
  const tags = v.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  return [`TITLE:\n${v.title ?? ""}`, `DESCRIPTION:\n${v.description ?? ""}`, `HASHTAGS:\n${tags}`].join("\n\n") + "\n";
}

export async function readyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { show?: string; page?: string } }>("/ready", async (req) => {
    const ws = await getDefaultWorkspace();
    const show = req.query.show ?? "waiting";
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const where = storyFilterFor(ws.id, show);

    // Both questions go to the database at the same time.
    const [total, stories, videoCount] = await Promise.all([
      prisma.story.count({ where }),
      prisma.story.findMany({
        where,
        select: {
          id: true,
          status: true,
          createdAt: true,
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
              thumbnails: { select: { storageKey: true }, orderBy: { createdAt: "desc" }, take: 1 },
              subtitles: { select: { id: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      // For the "Download all" button: how many video files this tab has.
      prisma.variant.count({ where: { ...variantFilterFor(show), outputKey: { not: null }, story: storyFilterFor(ws.id, show) } }),
    ]);

    // Give the browser a direct R2 address for each small preview picture. Before, every
    // picture went browser -> dashboard -> API -> R2, which made the page slow to fill.
    // (Making the address is quick: it is signed here, without asking R2.)
    const withPictures = await Promise.all(
      stories.map(async (s) => ({
        ...s,
        variants: await Promise.all(
          s.variants.map(async ({ thumbnails, ...v }) => ({
            ...v,
            thumbnails: thumbnails.map(() => ({ id: "latest" })),
            thumbnailUrl: thumbnails[0] && v.outputKey ? await downloadUrlFor(thumbnails[0].storageKey, { inline: true }) : null,
          })),
        ),
      })),
    );
    return { stories: withPictures, total, page, pageSize: PAGE_SIZE, videoCount: Math.min(videoCount, ZIP_MAX_VIDEOS) };
  });

  /**
   * "Download all": one .zip with every video of the tab (newest first, up to ZIP_MAX_VIDEOS).
   * Inside: a "Nepali" and an "English" folder, each video with its thumbnail and a .txt
   * holding the title, description and hashtags to paste.
   * Files flow straight from R2 into the zip ("streaming"), one at a time, so even
   * a big zip needs very little memory on the free server.
   */
  app.get<{ Querystring: { show?: string } }>("/ready/zip", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const show = req.query.show ?? "waiting";
    const variants = await prisma.variant.findMany({
      where: { ...variantFilterFor(show), outputKey: { not: null }, story: storyFilterFor(ws.id, show) },
      select: {
        language: true,
        title: true,
        description: true,
        hashtags: true,
        outputKey: true,
        thumbnails: { select: { storageKey: true }, orderBy: { createdAt: "desc" }, take: 1 },
        story: { select: { createdAt: true, topic: { select: { title: true } }, variants: { select: { language: true, title: true } } } },
      },
      orderBy: [{ story: { createdAt: "desc" } }, { language: "desc" }],
      take: ZIP_MAX_VIDEOS,
    });
    if (variants.length === 0) return reply.code(404).send({ error: "No videos to download on this tab" });

    // "store" = no squeezing. Videos are already compressed, so squeezing only wastes time.
    const zip = archiver("zip", { store: true });
    zip.on("warning", (err) => req.log.warn(err));
    const day = new Date().toISOString().slice(0, 10);
    reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="namaste-videos-${show}-${day}.zip"`)
      .send(zip); // the zip is sent while it is still being made

    // Add the files one after another (each starts only when the last one is in the zip).
    void (async () => {
      try {
        for (const v of variants) {
          const englishTitle = v.story.variants.find((x) => x.language === "en")?.title || v.story.topic.title;
          const folder = v.language === "ne" ? "Nepali" : "English";
          const base = { createdAt: v.story.createdAt, language: v.language, englishTitle };
          const videoName = downloadName({ ...base, kind: "video" });
          await addAndWait(zip, await readStream(v.outputKey!), `${folder}/${videoName}`);
          const thumb = v.thumbnails[0]?.storageKey;
          if (thumb) {
            await addAndWait(zip, await readStream(thumb).catch(() => null), `${folder}/${downloadName({ ...base, kind: "thumbnail" })}`);
          }
          zip.append(uploadText(v), { name: `${folder}/${videoName.replace(/\.mp4$/, "")}-text.txt` });
        }
        await zip.finalize();
      } catch (err) {
        req.log.error(err, "Download all failed");
        zip.abort(); // the browser shows the download as failed instead of a broken zip
      }
    })();
    return reply;
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

/** Put one file into the zip and wait until it is fully written (so only one file is open at a time). */
function addAndWait(zip: archiver.Archiver, stream: NodeJS.ReadableStream | null, name: string): Promise<void> {
  if (!stream) return Promise.resolve(); // e.g. the thumbnail was already deleted
  return new Promise((resolve, reject) => {
    const done = (entry: archiver.EntryData) => {
      if (entry.name === name) {
        zip.off("entry", done);
        resolve();
      }
    };
    zip.on("entry", done);
    stream.once("error", reject);
    zip.append(stream as NodeJS.ReadableStream & import("node:stream").Readable, { name });
  });
}
