/**
 * FULL VIDEO: adds ONE 4-5 minute video (wide 16:9, for YouTube) to the queue, in Nepali and English.
 * After the full video is made, the render step also cuts 2-3 shorts out of it (no extra AI cost).
 *
 * Used by the "Pipeline" workflow ("Run workflow" -> "Full video: topic").
 *   FULL_TOPIC      the topic, e.g. "What India and Nepal agreed during PM Balen Shah's visit"
 *                   (notes for the research may follow after "||": "topic || cover the rail links")
 *   FULL_NOTES      optional notes for the research (what to cover)
 *   FULL_SOURCES    optional news sources, one per line: "url | publisher | headline | 2026-11-23"
 *                   (only the url is needed). With sources, the video gets the NEWS look
 *                   (news bar, headline/trip/flag cards, real photos of the leaders) and the
 *                   neutral news rules, like the Nepal News & Politics series.
 *   FULL_LANGUAGES  "ne,en" (default), or "ne" for Nepali only
 *   FULL_TOPIC=resume  finish a full video whose run was stopped (no new story, no new AI writing)
 */
import { prisma, Prisma } from "@dualflow/db";
import { enqueue } from "@dualflow/queue";
import { JOB_NAMES, LANGUAGES, POLITICS_CATEGORY, type Language } from "@dualflow/shared";
import type { TopicSource } from "@dualflow/ai";

/** Read "url | publisher | headline | date" lines (only the url is required). Bad lines are skipped. */
export function parseSources(text: string): TopicSource[] {
  const out: TopicSource[] = [];
  for (const line of text.split(/\r?\n|\s*;;\s*/)) {
    const [url = "", publisher = "", title = "", date = ""] = line.split("|").map((p) => p.trim());
    if (!/^https?:\/\/\S+$/i.test(url) || out.some((s) => s.url === url)) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    out.push({ url, publisher: publisher || host, title: title || publisher || host, ...(date ? { publishedAt: date } : {}) });
  }
  return out.slice(0, 12);
}

/** "ne,en" -> ["ne", "en"]; anything unknown is ignored; nothing valid = both. */
export function parseLanguages(text: string | undefined): Language[] {
  const picked = (text ?? "").split(/[\s,]+/).filter((l): l is Language => (LANGUAGES as readonly string[]).includes(l));
  return picked.length ? [...new Set(picked)] : [...LANGUAGES];
}

/**
 * "resume": finish a full video whose run was stopped (machine shut down). Its steps are still
 * marked RUNNING by the dead run; give them back to the queue so this run does them (no new AI writing).
 */
async function resume() {
  const stories = await prisma.story.findMany({ where: { format: "LONG", status: "GENERATING" }, select: { id: true } });
  const freed = await prisma.pipelineJob.updateMany({
    where: { status: "RUNNING", storyId: { in: stories.map((s) => s.id) } },
    data: { status: "QUEUED", lockedUntil: null },
  });
  console.log(`Resume: ${freed.count} stopped full-video step(s) will run again now.`);
  await prisma.$disconnect();
}

async function main() {
  if ((process.env.FULL_TOPIC ?? "").trim().toLowerCase() === "resume") return resume();
  // "topic || notes": the GitHub form has one box, so notes can follow the topic after "||".
  const [rawTitle = "", ...noteParts] = (process.env.FULL_TOPIC ?? "").split("||");
  const title = rawTitle.trim();
  if (!title) throw new Error("Write the full video's topic in the FULL_TOPIC box.");
  const notes = [noteParts.join("||"), process.env.FULL_NOTES ?? ""].map((n) => n.trim()).filter(Boolean).join("\n");
  const sources = parseSources(process.env.FULL_SOURCES ?? "");
  const languages = parseLanguages(process.env.FULL_LANGUAGES);
  const workspace = await prisma.workspace.upsert({
    where: { slug: "default" },
    update: {},
    create: { slug: "default", name: "DualFlow" },
  });
  const topic = await prisma.topic.create({
    data: {
      workspaceId: workspace.id,
      title: title.slice(0, 200),
      notes: notes || null,
      source: "MANUAL",
      status: "USED",
      // News sources given: news look + neutral rules + at least 3 sources (Nepal News & Politics rules).
      ...(sources.length
        ? { category: POLITICS_CATEGORY, series: "news-explained", sources: sources as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  const story = await prisma.story.create({
    data: {
      workspaceId: workspace.id,
      topicId: topic.id,
      format: "LONG",
      status: "GENERATING",
      variants: { create: languages.map((language) => ({ language })) },
    },
  });
  await enqueue(JOB_NAMES.research, { storyId: story.id, run: story.run });
  console.log(`Full video added: "${title}" (${languages.join(" + ")}, ${sources.length} news sources) story=${story.id}`);
  await prisma.$disconnect();
}

// Only run when started as a program (the tests import the helpers above).
if (process.argv[1]?.endsWith("full-video.ts")) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
