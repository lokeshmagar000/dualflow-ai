/**
 * The pipeline steps. In Phase 0 they are placeholders that only move the
 * status forward, so we can test the whole flow end to end.
 * Phase 1 fills them with real AI calls (Claude, Azure TTS, Remotion).
 *
 * Order:  research (once per story)
 *      -> script, voice, thumbnail, render (once per language, in parallel)
 */
import { prisma } from "@dualflow/db";
import { JOB_NAMES, type JobName, type PipelineJobData } from "@dualflow/shared";
import { pipelineQueue } from "../connection";

type Step = (data: PipelineJobData) => Promise<void>;

/** Queue a step for every variant (Nepali and English) at the same time. */
async function fanOut(storyId: string, next: JobName) {
  const variants = await prisma.variant.findMany({ where: { storyId } });
  await Promise.all(
    variants.map((v) =>
      pipelineQueue.add(next, { storyId, variantId: v.id }, { jobId: `${next}-${v.id}` }),
    ),
  );
}

/** Queue the next step for one variant. */
async function then(data: PipelineJobData, next: JobName) {
  await pipelineQueue.add(next, data, { jobId: `${next}-${data.variantId}` });
}

const research: Step = async ({ storyId }) => {
  // TODO Phase 1: Claude + web search -> ResearchNote rows.
  await fanOut(storyId, JOB_NAMES.script);
};

const script: Step = async (data) => {
  // TODO Phase 1: Claude writes the script natively in this variant's language.
  await prisma.variant.update({ where: { id: data.variantId }, data: { status: "GENERATING" } });
  await then(data, JOB_NAMES.voice);
};

const voice: Step = async (data) => {
  // TODO Phase 1: Azure neural TTS (ne-NP-HemkalaNeural for Nepali) + word timings.
  await then(data, JOB_NAMES.thumbnail);
};

const thumbnail: Step = async (data) => {
  // TODO Phase 1: AI background + headline rendered with Remotion.
  await then(data, JOB_NAMES.render);
};

const render: Step = async (data) => {
  // TODO Phase 1: Remotion render with Devanagari subtitles.
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
