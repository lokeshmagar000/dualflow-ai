/**
 * Makes the NEPALI video of one story again, from a new Nepali script (the English video stays).
 * For when the Nepali video came out wrong, e.g. in English (2026-11-26, banana story).
 * Uses about 2-3 free Gemini requests (script + hashtags).
 *
 * Used by the "Pipeline" workflow when you fill "Remake the Nepali video" with a few words
 * of the topic (or "latest" for the newest story).
 */
import { prisma } from "@dualflow/db";
import { enqueue } from "@dualflow/queue";
import { JOB_NAMES } from "@dualflow/shared";

async function main() {
  const search = (process.env.REDO_NEPALI || "").trim();
  if (!search) return;
  const story = await prisma.story.findFirst({
    where: search.toLowerCase() === "latest" ? {} : { topic: { title: { contains: search, mode: "insensitive" } } },
    orderBy: { createdAt: "desc" },
    include: { topic: true, variants: true },
  });
  if (!story) {
    console.log(`No story found with "${search}" in its topic.`);
    process.exitCode = 1;
    return;
  }
  const ne = story.variants.find((v) => v.language === "ne");
  if (!ne) {
    console.log(`Story "${story.topic.title}" has no Nepali video.`);
    process.exitCode = 1;
    return;
  }
  // Remove the Nepali video's finished jobs, so the same jobs can be queued again.
  await prisma.pipelineJob.deleteMany({
    where: { variantId: ne.id, step: { in: [JOB_NAMES.script, JOB_NAMES.voice, JOB_NAMES.thumbnail, JOB_NAMES.render] } },
  });
  await prisma.variant.update({ where: { id: ne.id }, data: { status: "GENERATING", lastError: null } });
  await enqueue(JOB_NAMES.script, { storyId: story.id, variantId: ne.id, run: story.run });
  console.log(`Making the Nepali video again for "${story.topic.title}" (new Nepali script, voice and video).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
