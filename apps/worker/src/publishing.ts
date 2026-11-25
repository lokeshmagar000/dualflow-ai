/**
 * Publishing: decides WHEN each finished video goes to WHICH channel, and uploads it.
 *
 *   1. syncChannels()   makes one Channel row per configured platform + language
 *                       (so the dashboard can show them). Tokens come from GitHub Secrets or
 *                       from the dashboard's Connect buttons (see dashboard-connections.ts).
 *   2. planStory()      when both videos of a story are ready:
 *                         auto     -> an upload is added to the queue (status SCHEDULED)
 *                         approval -> an upload waits for your "Approve" (status READY)
 *                         manual   -> nothing; you press "Upload now" in the dashboard
 *   3. assignSlots()    gives every queued upload its own time slot (PUBLISH_TIMES),
 *                       so a channel gets at most one video per slot ("bulk queue").
 *   4. uploadDue()      uploads everything whose time has come, with retries.
 *                       PUBLISH_DRY_RUN=true only prints what would happen.
 *   5. A story is marked PUBLISHED only when EVERY channel got its video.
 *      Only then does the cleanup delete its files (DELETE_AFTER_PUBLISH).
 *
 * Videos from the bulk upload page (topic source UPLOAD) are different: you chose the
 * platforms yourself, so planStory() never adds other channels to them, and they count
 * as PUBLISHED when the channels YOU picked have them.
 */
import { prisma, type Language, type Platform, type PublishMode } from "@dualflow/db";
import {
  checkLimits,
  configuredChannels,
  dryRun,
  getUploader,
  planSlots,
  publishEnabled,
  PublishConfigError,
  PublishQuotaError,
  type ChannelConfig,
  type PlatformName,
  type TikTokPostOptions,
} from "@dualflow/publish";
import { contentTypeFor, readFile } from "@dualflow/storage";

const MINUTE = 60_000;
/** Shown on an upload while PUBLISH_DRY_RUN=true. */
export const PRACTICE_NOTE = "Practice mode: nothing was uploaded. For real uploads, set Auto upload on the Channels page to \"Ask me first\" or \"Fully automatic\".";
const toPlatform = (p: PlatformName) => p.toUpperCase() as Platform;
const toName = (p: Platform) => p.toLowerCase() as PlatformName;
const toMode = (m: ChannelConfig["mode"]) => m.toUpperCase() as PublishMode;

/** Make sure every configured channel has a row, with the current name and mode. */
export async function syncChannels(workspaceId: string) {
  const rows = [];
  for (const c of configuredChannels()) {
    const where = { workspaceId, platform: toPlatform(c.platform), language: c.language as Language };
    const existing = await prisma.channel.findFirst({ where });
    rows.push(
      existing
        ? await prisma.channel.update({
            where: { id: existing.id },
            // A channel connected on the dashboard keeps its real name (e.g. "Namaste Facts").
            data: { name: existing.accessTokenEnc || existing.refreshTokenEnc ? existing.name : c.label, mode: toMode(c.mode) },
          })
        : await prisma.channel.create({ data: { ...where, name: c.label, mode: toMode(c.mode) } }),
    );
  }
  return rows;
}

/** The channel rows that are configured right now (others are ignored). */
async function activeChannels(workspaceId: string) {
  const configured = new Set(configuredChannels().map((c) => `${toPlatform(c.platform)}-${c.language}`));
  const rows = await prisma.channel.findMany({ where: { workspaceId } });
  return rows.filter((r) => configured.has(`${r.platform}-${r.language}`));
}

/**
 * Put a ready story into the upload queue (or the approval list), depending on the mode.
 * Safe to run many times: an upload that already exists is left alone.
 */
export async function planStory(storyId: string) {
  if (!publishEnabled()) return;
  const story = await prisma.story.findUniqueOrThrow({ where: { id: storyId }, include: { variants: true, topic: true } });
  // Bulk uploads: only the platforms you ticked. Never add more by ourselves.
  if (story.topic.source === "UPLOAD") return;
  const channels = await syncChannels(story.workspaceId); // also picks up a changed PUBLISH_MODE
  let queued = 0;
  for (const v of story.variants) {
    if (!v.outputKey || !["READY", "SCHEDULED"].includes(v.status)) continue;
    for (const ch of channels.filter((c) => c.language === v.language)) {
      if (ch.mode === "MANUAL") continue;
      const status = ch.mode === "AUTO" ? "SCHEDULED" : "READY";
      const exists = await prisma.publication.findUnique({ where: { variantId_channelId: { variantId: v.id, channelId: ch.id } } });
      if (exists) continue;
      await prisma.publication.create({ data: { variantId: v.id, channelId: ch.id, status, scheduledAt: null } });
      if (status === "SCHEDULED") queued++;
    }
  }
  if (queued > 0) await markScheduled(storyId);
}

/** Show "scheduled" on the story and its videos (unless they are already published). */
export async function markScheduled(storyId: string) {
  await prisma.variant.updateMany({ where: { storyId, status: "READY" }, data: { status: "SCHEDULED" } });
  await prisma.story.updateMany({ where: { id: storyId, status: "READY" }, data: { status: "SCHEDULED" } });
}

/** Stories that became ready recently but have no uploads yet (e.g. made before you turned publishing on). */
export async function planRecentStories(workspaceId: string) {
  const days = Number(process.env.PUBLISH_BACKLOG_DAYS ?? 14);
  const stories = await prisma.story.findMany({
    where: { workspaceId, status: { in: ["READY", "SCHEDULED"] }, topic: { source: { not: "UPLOAD" } }, updatedAt: { gte: new Date(Date.now() - days * 24 * 60 * MINUTE) } },
    select: { id: true },
  });
  for (const s of stories) await planStory(s.id);
}

/** Give every queued upload without a time its own slot, channel by channel. */
export async function assignSlots(workspaceId: string, now = new Date()) {
  const opts = { times: process.env.PUBLISH_TIMES, timeZone: process.env.PUBLISH_TIMEZONE };
  for (const ch of await prisma.channel.findMany({ where: { workspaceId } })) {
    const waiting = await prisma.publication.findMany({
      where: { channelId: ch.id, status: "SCHEDULED", scheduledAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (waiting.length === 0) continue;
    const taken = await prisma.publication.findMany({
      where: { channelId: ch.id, scheduledAt: { not: null, gte: new Date(now.getTime() - 24 * 60 * MINUTE) } },
      select: { scheduledAt: true },
    });
    const slots = planSlots(waiting.length, taken.map((t) => t.scheduledAt!), now, opts);
    await prisma.$transaction(waiting.map((p, i) => prisma.publication.update({ where: { id: p.id }, data: { scheduledAt: slots[i] } })));
    console.log(`[publish] ${ch.name}: ${waiting.length} video(s) got times, first at ${slots[0]!.toISOString()}`);
  }
}

/** Wait before retry number n: 30 min, 1 h, 2 h, 4 h ... */
export function retryDelayMs(attempt: number) {
  return 30 * MINUTE * 2 ** Math.max(0, attempt - 1);
}

/** Upload everything that is due now. Returns counts for the log. */
export async function uploadDue(workspaceId: string, now = new Date()) {
  const practice = dryRun();
  const maxAttempts = Number(process.env.PUBLISH_MAX_ATTEMPTS ?? 5);
  const perChannel = Number(process.env.PUBLISH_MAX_PER_RUN ?? 2);

  // An upload stuck in "uploading" for 45 minutes (the machine stopped): give it back to the queue.
  await prisma.publication.updateMany({
    where: { status: "GENERATING", updatedAt: { lt: new Date(now.getTime() - 45 * MINUTE) } },
    data: { status: "SCHEDULED" },
  });

  const channels = await activeChannels(workspaceId);
  const result = { uploaded: 0, failed: 0, waiting: 0, practice: 0 };
  for (const ch of channels) {
    const due = await prisma.publication.findMany({
      where: { channelId: ch.id, status: "SCHEDULED", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: perChannel,
      include: {
        variant: {
          include: { story: { include: { topic: true } }, thumbnails: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
    });
    const uploader = getUploader(toName(ch.platform), ch.language);

    for (const pub of due) {
      const v = pub.variant;
      const label = `[publish] ${ch.name} <- "${v.title ?? v.story.topic.title}"`;
      if (!v.outputKey) {
        await prisma.publication.update({ where: { id: pub.id }, data: { status: "FAILED", error: "The video file is missing." } });
        result.failed++;
        continue;
      }
      if (practice) {
        console.log(`${label}: PRACTICE (dry run) - would upload ${v.outputKey} now. Nothing was uploaded.`);
        // Only a note, so the bulk upload page can tell you why nothing happened. The status stays the same.
        await prisma.publication.update({ where: { id: pub.id }, data: { error: PRACTICE_NOTE } });
        result.practice++;
        continue;
      }

      // Take the job (only if no other run took it first).
      const claimed = await prisma.publication.updateMany({
        where: { id: pub.id, status: "SCHEDULED" },
        data: { status: "GENERATING", attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;
      const attempt = pub.attempts + 1;

      try {
        const [video, thumbnail] = await Promise.all([
          readFile(v.outputKey),
          v.thumbnails[0] ? readFile(v.thumbnails[0].storageKey).catch(() => null) : Promise.resolve(null),
        ]);
        // Last check of the platform's size and length rules (see packages/publish/src/limits.ts).
        const limits = checkLimits(uploader.platform, { sizeBytes: video.length, durationSec: v.durationSec });
        if (!limits.ok) throw new PublishConfigError(`${ch.name}: ${limits.problems.join(" ")}`);
        const started = Date.now();
        const res = await uploader.upload({
          language: v.language,
          format: v.story.format,
          video,
          mimeType: contentTypeFor(v.outputKey),
          thumbnail,
          title: v.title || v.story.topic.title,
          description: v.description ?? "",
          hashtags: v.hashtags,
          durationSec: v.durationSec,
          requestKey: pub.id, // Upload-Post: a retry of this upload never posts twice
          // TikTok: the choices from the dashboard's upload window (none for Auto upload).
          tiktok: ch.platform === "TIKTOK" ? readTikTokOptions(pub.options) : null,
        });
        await prisma.publication.update({
          where: { id: pub.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), platformPostId: res.postId, postUrl: res.url ?? null, error: res.note ?? null },
        });
        console.log(`${label}: uploaded in ${Math.round((Date.now() - started) / 1000)} s ${res.url ?? res.postId}${res.note ? ` (${res.note})` : ""}`);
        result.uploaded++;
        await markPublishedIfDone(v.storyId);
      } catch (err) {
        const message = String((err as Error).message ?? err).slice(0, 500);
        if (err instanceof PublishQuotaError) {
          // Daily limit: wait, and do not count this as a failed try.
          await prisma.publication.update({
            where: { id: pub.id },
            data: { status: "SCHEDULED", scheduledAt: err.retryAt, attempts: { decrement: 1 }, error: message },
          });
          console.log(`${label}: limit reached, will try at ${err.retryAt.toISOString()}`);
          result.waiting++;
        } else if (err instanceof PublishConfigError || attempt >= maxAttempts) {
          await prisma.publication.update({ where: { id: pub.id }, data: { status: "FAILED", error: message } });
          console.log(`::error::${label}: ${message}`);
          result.failed++;
        } else {
          const retryAt = new Date(Date.now() + retryDelayMs(attempt));
          await prisma.publication.update({ where: { id: pub.id }, data: { status: "SCHEDULED", scheduledAt: retryAt, error: message } });
          console.log(`::warning::${label}: try ${attempt} of ${maxAttempts} failed, next try ${retryAt.toISOString()}: ${message}`);
          result.waiting++;
        }
      }
    }
  }
  return result;
}

/**
 * When every configured channel of every language got its video, the story is PUBLISHED.
 * (A manual-mode channel without an upload yet keeps the story open, so its files are kept.)
 */
export async function markPublishedIfDone(storyId: string) {
  const story = await prisma.story.findUniqueOrThrow({
    where: { id: storyId },
    include: { variants: { include: { publications: true } }, topic: { select: { source: true } } },
  });
  const channels = await activeChannels(story.workspaceId);
  const picked = story.topic.source === "UPLOAD";
  let allDone = channels.length > 0;
  for (const v of story.variants) {
    // Bulk upload: only the channels you picked (they have an upload row). Otherwise: every channel of this language.
    const mine = picked
      ? channels.filter((c) => v.publications.some((p) => p.channelId === c.id))
      : channels.filter((c) => c.language === v.language);
    const done = mine.length > 0 && mine.every((c) => v.publications.some((p) => p.channelId === c.id && p.status === "PUBLISHED"));
    if (done && v.status !== "PUBLISHED") await prisma.variant.update({ where: { id: v.id }, data: { status: "PUBLISHED" } });
    if (!done) allDone = false;
  }
  if (allDone) {
    await prisma.story.update({ where: { id: storyId }, data: { status: "PUBLISHED" } });
    console.log(`[publish] story ${storyId} is on every channel; its files can now be deleted by the cleanup.`);
  }
}

/** The TikTok part of a publication's saved choices, or null when there is none (or it looks wrong). */
export function readTikTokOptions(options: unknown): TikTokPostOptions | null {
  const t = (options as { tiktok?: Partial<TikTokPostOptions> } | null)?.tiktok;
  if (!t || typeof t.privacyLevel !== "string" || typeof t.caption !== "string") return null;
  return {
    privacyLevel: t.privacyLevel,
    caption: t.caption,
    allowComment: t.allowComment !== false,
    allowDuet: t.allowDuet !== false,
    allowStitch: t.allowStitch !== false,
    brandOrganic: Boolean(t.brandOrganic),
    brandedContent: Boolean(t.brandedContent),
  };
}
