/**
 * AUTOMATIC VIDEOS: adds the next story to the queue by itself.
 *
 * The "Pipeline" workflow runs this before it makes the videos
 * (`pnpm --filter @dualflow/worker auto-ideas`). It adds at most
 * AUTO_STORIES_PER_RUN stories (default 1), and stops when today already has
 * AUTO_STORIES_PER_DAY stories (default 2; 0 turns automatic videos off).
 * "Today" is the day in Nepal (AUTO_TIMEZONE, default Asia/Kathmandu).
 *
 * Where the topic comes from:
 *   1. your own ideas on the "Ideas & auto mode" page that are not made yet (oldest first),
 *   2. otherwise the AI Content Director picks a new topic (packages/ai/src/topic.ts).
 *
 * Auto mode switch (dashboard, Ideas page): when you turn it OFF, scheduled runs add nothing.
 * The "Generate now" button sets AUTO_FORCE=true: it adds one story even when Auto mode
 * is off or today already has enough.
 *
 * Scheduled runs pass AUTO_SLOT: "1" for the 2 AM run and its 3 AM backup, "2" for the
 * 4 AM run and its 5 AM backup. A run only adds a story while today has fewer than its
 * slot number, so a backup run adds one only when GitHub skipped the main run.
 *
 * It waits (adds nothing) while another story is still being made, while the
 * kill switch is on, or when today's free Gemini requests would not be enough
 * for a whole story. Then the next run tries again.
 * A story that says "being made" but has no step left in the queue is stuck
 * (it can never finish): it is marked as failed so it stops blocking new videos.
 */
import { prisma } from "@dualflow/db";
import { enqueue } from "@dualflow/queue";
import { JOB_NAMES, LANGUAGES } from "@dualflow/shared";
import { aiProvider, currentQuotaDayStart, suggestTopic } from "@dualflow/ai";
import { geminiDailyLimit } from "./budget";

/** Gemini requests one whole story needs: 1 topic + 2 research + 2 scripts, plus room for one retry. */
const GEMINI_REQUESTS_PER_STORY = 6;

/** Midnight of today in the given time zone, as a UTC Date. */
export function startOfLocalDay(timeZone: string, now = new Date()): Date {
  // Find how far the zone is from UTC right now (Nepal: +5:45), then go back to its midnight.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const localMidnightAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"));
  return new Date(localMidnightAsUtc - offsetMs);
}

/**
 * How many stories this run may add.
 * `slot` (from AUTO_SLOT) caps the day's total for this run: slot 1 = only the day's first video.
 */
export function roomForRun(opts: { force: boolean; perDay: number; perRun: number; today: number; slot?: number }): number {
  if (opts.force) return 1;
  const cap = opts.slot && opts.slot > 0 ? Math.min(opts.perDay, opts.slot) : opts.perDay;
  return Math.max(0, Math.min(opts.perRun, cap - opts.today));
}

async function main() {
  const force = process.env.AUTO_FORCE === "true"; // the "Generate now" button
  const perDay = Number(process.env.AUTO_STORIES_PER_DAY ?? 2);
  const perRun = Math.max(1, Number(process.env.AUTO_STORIES_PER_RUN ?? 1));
  const timeZone = process.env.AUTO_TIMEZONE || "Asia/Kathmandu";
  if (!(perDay > 0) && !force) {
    console.log("Automatic videos are off (AUTO_STORIES_PER_DAY=0).");
    return;
  }

  const workspace = await prisma.workspace.upsert({
    where: { slug: "default" },
    update: {},
    create: { slug: "default", name: "DualFlow" },
  });

  // The Auto mode switch is saved as an "automation rule" without a channel. No rule yet = on.
  const autoRule = await prisma.automationRule.findFirst({ where: { workspaceId: workspace.id, channelId: null } });
  if (autoRule && !autoRule.enabled && !force) {
    console.log("Auto mode is OFF (Ideas page). No new story added. Press Generate now for one anyway.");
    return;
  }

  if (await prisma.budget.findFirst({ where: { workspaceId: workspace.id, paused: true } })) {
    console.log("Automation is paused (kill switch on the Costs page). No new story added.");
    return;
  }

  // Bulk uploads (your own finished videos) are stories too, but they are not counted.
  const made = { workspaceId: workspace.id, topic: { source: { not: "UPLOAD" as const } } };
  const generating = await prisma.story.findMany({ where: { ...made, status: "GENERATING" }, select: { id: true, run: true } });
  let busy = 0;
  let waitingUntil: Date | null = null;
  for (const s of generating) {
    const next = await prisma.pipelineJob.findFirst({
      where: { storyId: s.id, run: s.run, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { runAfter: "asc" },
      select: { runAfter: true },
    });
    if (!next) {
      // Nothing left in the queue for it: it can never finish. Stop it blocking new videos.
      await prisma.story.update({
        where: { id: s.id },
        data: { status: "FAILED", lastError: "Stopped: no step was left to run. Press Retry on the story to make it again." },
      });
      await prisma.variant.updateMany({ where: { storyId: s.id, status: "GENERATING" }, data: { status: "FAILED" } });
      console.log(`Story ${s.id} was stuck (no step left in the queue). Marked as failed.`);
      continue;
    }
    busy++;
    if (next.runAfter > new Date() && (!waitingUntil || next.runAfter > waitingUntil)) waitingUntil = next.runAfter;
  }
  if (busy > 0) {
    const why = waitingUntil
      ? ` It waits for the free Gemini limit until ${waitingUntil.toISOString()} (UTC).`
      : "";
    console.log(`${busy} story(s) still being made.${why} The new one waits for the next run.`);
    return;
  }

  const today = await prisma.story.count({ where: { ...made, createdAt: { gte: startOfLocalDay(timeZone) } } });
  const slot = Number(process.env.AUTO_SLOT || 0) || undefined;
  const room = roomForRun({ force, perDay, perRun, today, slot });
  if (room <= 0) {
    console.log(
      slot && slot < perDay && today >= slot
        ? `Today already has ${today} automatic story(s); this run was for video ${slot}. Nothing to add.`
        : `Today already has ${today} of ${perDay} automatic stories. Next one tomorrow.`,
    );
    return;
  }

  for (let i = 0; i < room; i++) {
    // 1. Your own ideas that are not made yet.
    let topic = await prisma.topic.findFirst({
      where: { workspaceId: workspace.id, status: { in: ["NEW", "ACCEPTED"] }, source: { not: "UPLOAD" } },
      orderBy: { createdAt: "asc" },
    });

    // 2. Otherwise the AI picks one.
    if (!topic) {
      if (aiProvider() === "gemini") {
        const used = await prisma.costEvent.aggregate({
          _sum: { units: true },
          where: { workspaceId: workspace.id, provider: { startsWith: "gemini:" }, createdAt: { gte: currentQuotaDayStart() } },
        });
        if ((used._sum.units ?? 0) + GEMINI_REQUESTS_PER_STORY > geminiDailyLimit()) {
          console.log("Not enough free Gemini requests left today for a whole story. Trying again after the reset.");
          return;
        }
      }
      const recent = await prisma.topic.findMany({
        where: { workspaceId: workspace.id, source: { not: "UPLOAD" } },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { title: true },
      });
      const brand = await prisma.brandProfile.findUnique({ where: { workspaceId: workspace.id } });
      const { idea, costs } = await suggestTopic({
        recentTitles: recent.map((t) => t.title),
        niche: process.env.AUTO_TOPIC_NICHE || brand?.niche || undefined,
      });
      topic = await prisma.topic.create({
        data: { workspaceId: workspace.id, title: idea.title.slice(0, 200), notes: idea.notes, source: "DIRECTOR" },
      });
      if (costs.length) {
        await prisma.costEvent.createMany({ data: costs.map((c) => ({ workspaceId: workspace.id, ...c })) });
      }
    }

    const story = await prisma.story.create({
      data: {
        workspaceId: workspace.id,
        topicId: topic.id,
        format: "SHORT",
        status: "GENERATING",
        variants: { create: LANGUAGES.map((language) => ({ language })) },
      },
    });
    await prisma.topic.update({ where: { id: topic.id }, data: { status: "USED" } });
    await enqueue(JOB_NAMES.research, { storyId: story.id, run: story.run });
    console.log(`Automatic story added: "${topic.title}" (${topic.source === "DIRECTOR" ? "picked by AI" : "from your ideas"})`);
  }
}

// Only run when started as a script (the tests import startOfLocalDay).
if (process.argv[1]?.endsWith("auto-ideas.ts")) {
  main()
    .catch((err) => {
      // A problem here must never stop the videos already in the queue.
      console.error(`Could not add an automatic story: ${(err as Error).message}`);
    })
    .finally(() => prisma.$disconnect());
}
