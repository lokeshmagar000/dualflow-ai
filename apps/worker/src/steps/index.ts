/**
 * The pipeline steps.
 *
 * Order:  research (once per story)
 *      -> script, voice, thumbnail, render (once per language, in parallel)
 *
 * Phase 1A (this file): research and script are real (Claude).
 * voice, thumbnail and render are still placeholders (Phase 1B and 1C).
 */
import { prisma, type Prisma } from "@dualflow/db";
import { researchTopic, writeScript, type Research } from "@dualflow/ai";
import { JOB_NAMES, type JobName, type Language, type PipelineJobData } from "@dualflow/shared";
import { pipelineQueue } from "../connection";
import { assertBudget, recordCosts } from "../budget";

type Step = (data: PipelineJobData) => Promise<void>;

/** Queue a step for every variant (Nepali and English) at the same time. */
async function fanOut(storyId: string, run: number, next: JobName) {
  const variants = await prisma.variant.findMany({ where: { storyId } });
  await Promise.all(
    variants.map((v) =>
      pipelineQueue.add(next, { storyId, variantId: v.id, run }, { jobId: `${next}-${v.id}-${run}` }),
    ),
  );
}

/**
 * Queue the next step for one variant.
 * The job id includes the run number: adding the same id twice does nothing,
 * which stops duplicate work if a step is retried.
 */
async function then(data: PipelineJobData, next: JobName) {
  await pipelineQueue.add(next, data, { jobId: `${next}-${data.variantId}-${data.run ?? 1}` });
}

const research: Step = async ({ storyId, run = 1 }) => {
  const story = await prisma.story.findUniqueOrThrow({ where: { id: storyId }, include: { topic: true } });
  await assertBudget(story.workspaceId);

  const { research, costs } = await researchTopic({
    title: story.topic.title,
    notes: story.topic.notes,
    format: story.format,
  });
  await recordCosts(story.workspaceId, story.id, costs);

  // Save the facts on the topic. Replacing old ones first makes a retry safe.
  await prisma.$transaction([
    prisma.researchNote.deleteMany({ where: { topicId: story.topicId } }),
    prisma.researchNote.createMany({
      data: research.facts.map((f) => ({
        topicId: story.topicId,
        claim: f.claim,
        sourceUrl: f.sourceUrl || null,
        verified: Boolean(f.sourceUrl),
      })),
    }),
    prisma.story.update({
      where: { id: story.id },
      data: {
        visualPlan: research.visualPlan as unknown as Prisma.InputJsonValue,
        research: { summary: research.summary, facts: research.facts } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  await fanOut(storyId, run, JOB_NAMES.script);
};

const script: Step = async (data) => {
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { id: data.variantId },
    include: { story: { include: { topic: true } } },
  });
  const { story } = variant;
  await assertBudget(story.workspaceId);
  await prisma.variant.update({ where: { id: variant.id }, data: { status: "GENERATING", lastError: null } });

  // Rebuild the Research object saved by the research step.
  const saved = story.research as unknown as Pick<Research, "summary" | "facts"> | null;
  const visualPlan = story.visualPlan as unknown as Research["visualPlan"] | null;
  if (!saved || !visualPlan) throw new Error("Research is missing for this story.");

  const { script, costs } = await writeScript({
    language: variant.language as Language,
    title: story.topic.title,
    format: story.format,
    research: { ...saved, visualPlan },
  });
  await recordCosts(story.workspaceId, story.id, costs);

  // Replace the scenes (safe to run twice) and save title, description, hashtags.
  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { variantId: variant.id } }),
    prisma.scene.createMany({
      data: script.scenes.map((s, i) => ({
        variantId: variant.id,
        order: i + 1,
        purpose: visualPlan[i]?.purpose ?? null,
        text: s.text,
      })),
    }),
    prisma.variant.update({
      where: { id: variant.id },
      data: {
        title: script.title,
        description: script.description,
        hashtags: script.hashtags,
        thumbnailHeadline: script.thumbnailHeadline,
      },
    }),
  ]);

  await then(data, JOB_NAMES.voice);
};

const voice: Step = async (data) => {
  // TODO Phase 1B: Azure neural TTS (ne-NP-HemkalaNeural for Nepali) + word timings + subtitles.
  await then(data, JOB_NAMES.thumbnail);
};

const thumbnail: Step = async (data) => {
  // TODO Phase 1C: AI background + headline rendered with Remotion.
  await then(data, JOB_NAMES.render);
};

const render: Step = async (data) => {
  // TODO Phase 1C: Remotion render with Devanagari subtitles.
  await prisma.variant.update({ where: { id: data.variantId }, data: { status: "READY" } });
  await markStoryReadyIfDone(data.storyId);
};

const publish: Step = async () => {
  // TODO Phase 2: YouTube / Facebook / Instagram / TikTok adapters.
};

/** When BOTH languages are ready, the story is ready. */
async function markStoryReadyIfDone(storyId: string) {
  const notReady = await prisma.variant.count({ where: { storyId, status: { not: "READY" } } });
  if (notReady === 0) await prisma.story.update({ where: { id: storyId }, data: { status: "READY" } });
}

export const steps: Record<JobName, Step> = { research, script, voice, thumbnail, render, publish };
