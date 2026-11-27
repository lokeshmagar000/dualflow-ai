/**
 * "Ready to upload" page: finished videos you download and upload yourself.
 *
 *   GET  /ready?show=waiting|uploaded|all&page=1   finished stories, newest first, 10 per page
 *   GET  /ready/zip?show=waiting|uploaded|all      "Download all": every video of that tab in one .zip
 *   GET  /ready/zip?story=<id>                     "Download this topic": only that topic's Nepali + English pair
 *   GET  /variants/:id/download/:kind              video, thumbnail, srt or clip (?inline=1 to play/show it,
 *                                                  thumbnail: ?size=shorts|youtube|feed for another size,
 *                                                  clip: ?n=1|2|3 = a short cut from a full video)
 *   POST /variants/:id/uploaded                    { uploaded: true | false } = the "Mark as uploaded" button
 */
import { myPictureRows } from "./mypictures";
import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import { prisma, type Prisma } from "@dualflow/db";
import { contentTypeFor, downloadUrlFor, fileExists, fileSize, readFile, readStream, storageDriver, storageLabel, storageProblem } from "@dualflow/storage";
import { POLITICS_CATEGORY, politicsSeries, sourceName, THUMBNAIL_SIZE_NAMES, thumbnailKeyFor, type ThumbnailSizeName } from "@dualflow/shared";
import { getDefaultWorkspace } from "../workspace";

const KINDS = ["video", "thumbnail", "srt", "clip"] as const;
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
export function downloadName(opts: { createdAt: Date; language: string; englishTitle: string; kind: Kind; size?: string; n?: number }): string {
  const ext = { video: "mp4", thumbnail: "jpg", srt: "srt", clip: "mp4" }[opts.kind];
  const extra =
    opts.kind === "thumbnail" ? `-thumbnail${opts.size ? `-${opts.size}` : ""}` : opts.kind === "srt" ? "-subtitles" : opts.kind === "clip" ? `-short-${opts.n ?? 1}` : "";
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

/** FULL VIDEO: the shorts cut from it (Variant.clips), safely read. */
export type Clip = { key: string; title: string; startSec: number; durationSec: number };
export function clipsOf(value: unknown): Clip[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is Clip => Boolean(c) && typeof (c as Clip).key === "string" && typeof (c as Clip).durationSec === "number");
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
          format: true,
          createdAt: true,
          topic: { select: { title: true, source: true, category: true, series: true, sources: true } },
          research: true, // only read for politics videos (their sources)
          myPictures: true,
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
              clips: true,
              thumbnails: { select: { storageKey: true, sizes: true }, orderBy: { createdAt: "desc" }, take: 1 },
              subtitles: { select: { id: true }, take: 1 },
              // Where this video was sent with the Upload buttons (or by Auto upload).
              publications: { select: { status: true, postUrl: true, error: true, scheduledAt: true, channel: { select: { name: true, platform: true } } } },
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
      stories.map(async ({ research, myPictures, topic: { sources, ...topic }, ...s }) => ({
        ...s,
        topic,
        // "My pictures": small previews (photos) and names, for the panel under the story.
        myPictures: await myPictureRows(myPictures),
        // Nepal News & Politics: the series and the sources to check before you approve it.
        politics: politicsInfo(topic, sources, research),
        variants: await Promise.all(
          s.variants.map(async ({ thumbnails, clips, ...v }) => ({
            ...v,
            // Full video: its shorts (title and length only; the download asks for the file).
            clips: clipsOf(clips).map((c, i) => ({ n: i + 1, title: c.title, durationSec: c.durationSec })),
            thumbnails: thumbnails.map(() => ({ id: "latest" })),
            // Extra sizes (YouTube, Shorts, Facebook/Instagram post) for the download buttons.
            thumbnailSizes: thumbnails[0]?.sizes ?? [],
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
  app.get<{ Querystring: { show?: string; story?: string } }>("/ready/zip", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const show = req.query.show ?? "waiting";
    // ?story=<id>: just ONE topic (its Nepali and English video), whatever the tab.
    const storyId = typeof req.query.story === "string" && /^[a-z0-9]{10,40}$/i.test(req.query.story) ? req.query.story : null;
    if (req.query.story && !storyId) return reply.code(400).send({ error: "Unknown topic" });
    const where: Prisma.VariantWhereInput = storyId
      ? { storyId, outputKey: { not: null }, story: { workspaceId: ws.id } }
      : { ...variantFilterFor(show), outputKey: { not: null }, story: storyFilterFor(ws.id, show) };
    const variants = await prisma.variant.findMany({
      where,
      select: {
        language: true,
        title: true,
        description: true,
        hashtags: true,
        outputKey: true,
        clips: true,
        thumbnails: { select: { storageKey: true, sizes: true }, orderBy: { createdAt: "desc" }, take: 1 },
        subtitles: { select: { storageKey: true }, orderBy: { createdAt: "desc" }, take: 1 },
        story: { select: { createdAt: true, topic: { select: { title: true } }, variants: { select: { language: true, title: true } } } },
      },
      orderBy: [{ story: { createdAt: "desc" } }, { language: "desc" }],
      take: ZIP_MAX_VIDEOS,
    });
    if (variants.length === 0) return reply.code(404).send({ error: storyId ? "This topic has no video files (they may have been deleted to save storage)" : "No videos to download on this tab" });

    // "store" = no squeezing. Videos are already compressed, so squeezing only wastes time.
    const zip = archiver("zip", { store: true });
    zip.on("warning", (err) => req.log.warn(err));
    const day = new Date().toISOString().slice(0, 10);
    const first = variants[0]!;
    const topicName = slugify(first.story.variants.find((x) => x.language === "en")?.title || first.story.topic.title);
    const fileName = storyId ? `namaste-${first.story.createdAt.toISOString().slice(0, 10)}-${topicName}.zip` : `namaste-videos-${show}-${day}.zip`;
    reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${fileName}"`)
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
            for (const size of (v.thumbnails[0]?.sizes ?? []) as ThumbnailSizeName[]) {
              const name = `${folder}/${downloadName({ ...base, kind: "thumbnail", size })}`;
              await addAndWait(zip, await readStream(thumbnailKeyFor(thumb, size)).catch(() => null), name);
            }
          }
          const srt = v.subtitles[0]?.storageKey;
          if (srt) await addAndWait(zip, await readStream(srt).catch(() => null), `${folder}/${downloadName({ ...base, kind: "srt" })}`);
          // Full video: its shorts go in a "Shorts" folder next to it.
          for (const [i, c] of clipsOf(v.clips).entries()) {
            await addAndWait(zip, await readStream(c.key).catch(() => null), `${folder}/Shorts/${downloadName({ ...base, kind: "clip", n: i + 1 })}`);
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

  /** Settings page: can this server really reach the video storage? */
  app.get("/storage/check", async () => {
    const problem = await storageProblem().catch((e: Error) => e.message);
    return { driver: storageDriver(), where: storageLabel(), ok: !problem, problem };
  });

  app.get<{ Params: { id: string; kind: string }; Querystring: { inline?: string; size?: string; n?: string } }>(
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
      // Full video: ?n=1|2|3 = which short.
      const n = kind === "clip" ? Math.floor(Number(req.query.n) || 1) : undefined;
      const clip = n ? clipsOf(variant.clips)[n - 1] : undefined;
      let key = { video: variant.outputKey, thumbnail: variant.thumbnails[0]?.storageKey, srt: variant.subtitles[0]?.storageKey, clip: clip?.key }[kind];
      // Another thumbnail size: only one that was really made for this video.
      const size = kind === "thumbnail" ? (req.query.size as ThumbnailSizeName | undefined) : undefined;
      if (size) {
        if (!THUMBNAIL_SIZE_NAMES.includes(size) || !variant.thumbnails[0]?.sizes.includes(size)) {
          return reply.code(404).send({ error: "This thumbnail size was not made for this video" });
        }
        key = thumbnailKeyFor(key!, size);
      }
      if (!key) return reply.code(404).send({ error: "File not made yet, or already deleted" });

      const englishTitle = variant.story.variants.find((v) => v.language === "en")?.title || variant.story.topic.title;
      const fileName = downloadName({ createdAt: variant.story.createdAt, language: variant.language, englishTitle, kind, size, n });
      const inline = req.query.inline === "1";

      // Cloudflare R2: first ask R2 if the file is really there (a quick "HEAD" request), so a
      // wrong bucket name or wrong keys on Render show a clear message instead of an R2 error page.
      if (storageDriver() === "r2") {
        let size: number | null;
        try {
          size = await fileSize(key);
        } catch {
          // 422 (not 502), so the dashboard does not keep retrying a settings problem.
          return reply.code(422).send({ error: (await storageProblem()) ?? "Cloudflare R2 did not answer. Try again in a minute." });
        }
        if (size === null) {
          const problem = await storageProblem();
          if (problem) return reply.code(422).send({ error: problem });
          return reply.code(404).send({ error: "This file is not in your video storage any more (it may have been deleted after upload)." });
        }
      }
      // Send a short-lived download address; the browser gets the file straight from R2.
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

/** Series name and up to 8 sources (news first, then the research's facts) of a politics video. */
function politicsInfo(topic: { category: string | null; series: string | null }, sources: unknown, research: unknown) {
  if (topic.category !== POLITICS_CATEGORY) return null;
  const list: { name: string; url: string }[] = [];
  const add = (url: string | undefined | null, name?: string | null) => {
    if (!url || list.some((l) => l.url === url) || list.length >= 8) return;
    list.push({ url, name: name || sourceName(url) || url });
  };
  for (const n of (sources as { url: string; publisher?: string; title?: string }[] | null) ?? []) add(n.url, n.publisher ? `${n.publisher}: ${n.title ?? ""}` : n.title);
  const r = (research ?? {}) as { facts?: { sourceUrl?: string }[]; sources?: { url: string; title: string }[] };
  for (const f of r.facts ?? []) add(f.sourceUrl);
  for (const x of r.sources ?? []) add(x.url, sourceName(x.url, x.title));
  const series = politicsSeries(topic.series);
  return { series: series?.nameEn ?? "Nepal News & Politics", sources: list };
}
