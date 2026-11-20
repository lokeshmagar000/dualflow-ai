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
 *   1. your own ideas on the "Ideas & Chat" page that are not made yet (oldest first),
 *   2. otherwise the AI Content Director picks a new topic (packages/ai/src/topic.ts).
 *
 * It waits (adds nothing) while another story is still being made, while the
 * kill switch is on, or when today's free Gemini requests would not be enough
 * for a whole story. Then the next run tries again.
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

async function main() {
  const perDay = Number(process.env.AUTO_STORIES_PER_DAY ?? 2);
  const perRun = Math.max(1, Number(process.env.AUTO_STORIES_PER_RUN ?? 1));
  const timeZone = process.env.AUTO_TIMEZONE || "Asia/Kathmandu";
  if (!(perDay > 0)) {
    console.log("Automatic videos are off (AUTO_STORIES_PER_DAY=0).");
    return;
  }

  const workspace = await prisma.workspace.upsert({
    where: { slug: "default" },
    update: {},
    create: { slug: "default", name: "DualFlow" },
  });

  if (await prisma.budget.findFirst({ where: { workspaceId: workspace.id, paused: true } })) {
    console.log("Automation is paused (kill switch on the Costs page). No new story added.");
    return;
  }

  // Bulk uploads (your own finished videos) are stories too, but they are not counted.
  const made = { workspaceId: workspace.id, topic: { source: { not: "UPLOAD" as const } } };
  const busy = await prisma.story.count({ where: { ...made, status: "GENERATING" } });
  if (busy > 0) {
    console.log(`${busy} story(s) still being made. The new one waits for the next run.`);
    return;
  }

  const today = await prisma.story.count({ where: { ...made, createdAt: { gte: startOfLocalDay(timeZone) } } });
  const room = Math.min(perRun, perDay - today);
  if (room <= 0) {
    console.log(`Today already has ${today} of ${perDay} automatic stories. Next one tomorrow.`);
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
