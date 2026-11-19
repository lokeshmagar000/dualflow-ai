/**
 * Adds ONE practice story (Nepali + English) to the queue, so a pipeline
 * run has something to make. Used by the "Pipeline" workflow when you tick
 * "Add a practice story first". Safe to run on an empty database.
 */
import { prisma } from "@dualflow/db";
import { enqueue } from "@dualflow/queue";
import { JOB_NAMES, LANGUAGES } from "@dualflow/shared";

async function main() {
  const title = process.env.DEMO_TOPIC || "Three amazing facts about Mount Everest";
  const workspace = await prisma.workspace.upsert({
    where: { slug: "default" },
    update: {},
    create: { slug: "default", name: "DualFlow" },
  });
  await prisma.budget.upsert({
    where: { workspaceId_period: { workspaceId: workspace.id, period: "DAILY" } },
    update: {},
    create: { workspaceId: workspace.id, period: "DAILY", capUsd: 5 },
  });
  const topic = await prisma.topic.create({ data: { workspaceId: workspace.id, title, source: "MANUAL", status: "USED" } });
  const story = await prisma.story.create({
    data: {
      workspaceId: workspace.id,
      topicId: topic.id,
      format: "SHORT",
      status: "GENERATING",
      variants: { create: LANGUAGES.map((language) => ({ language })) },
    },
  });
  await enqueue(JOB_NAMES.research, { storyId: story.id, run: story.run });
  console.log(`Practice story added: "${title}" (${story.id})`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
