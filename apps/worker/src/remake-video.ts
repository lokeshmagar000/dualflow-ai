/**
 * Makes the video again for the newest finished story, reusing its script and voice.
 * Uses NO Gemini requests, so it works even when today's free limit is used up.
 * Handy after changing the look of the video or adding a stock clip key.
 * Used by the "Pipeline" workflow when you tick "Remake the newest video".
 */
import { prisma } from "@dualflow/db";
import { enqueue } from "@dualflow/queue";
import { JOB_NAMES } from "@dualflow/shared";

async function main() {
  const story = await prisma.story.findFirst({
    where: { variants: { some: { voiceovers: { some: {} } } } },
    orderBy: { createdAt: "desc" },
    include: { variants: { include: { voiceovers: true } } },
  });
  if (!story) {
    console.log("No story with a voice yet. Make one first (tick 'Add a practice story').");
    return;
  }
  // Remove the finished render jobs, so the same jobs can be queued again.
  await prisma.pipelineJob.deleteMany({ where: { storyId: story.id, step: JOB_NAMES.render } });
  for (const v of story.variants.filter((v) => v.voiceovers.length > 0)) {
    await prisma.variant.update({ where: { id: v.id }, data: { status: "GENERATING" } });
    await enqueue(JOB_NAMES.render, { storyId: story.id, variantId: v.id, run: story.run });
  }
  console.log(`Remaking the video for story ${story.id}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
