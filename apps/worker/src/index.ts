/**
 * DualFlow worker: takes jobs from the queue and runs the matching step.
 * You can run many copies of this program to process more videos at once.
 */
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@dualflow/db";
import { isPermanentError } from "@dualflow/ai";
import { VoiceConfigError } from "@dualflow/voice";
import { QUEUE_NAME, type JobName, type PipelineJobData } from "@dualflow/shared";
import { connection } from "./connection";
import { steps } from "./steps";

const worker = new Worker<PipelineJobData, void, JobName>(
  QUEUE_NAME,
  async (job) => {
    const step = steps[job.name];
    if (!step) throw new Error(`Unknown step: ${job.name}`);
    console.log(`[${job.name}] story=${job.data.storyId} variant=${job.data.variantId ?? "-"}`);
    try {
      await step(job.data);
    } catch (err) {
      // Errors that retrying cannot fix (bad key, bad request): stop now.
      if (isPermanentError(err) || err instanceof VoiceConfigError) throw new UnrecoverableError((err as Error).message);
      throw err; // other errors (timeouts, rate limits) are retried
    }
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) },
);

// After the last retry fails (or the error says "don't retry"), mark it FAILED
// and save the reason, so the dashboard can show what went wrong.
worker.on("failed", async (job, err) => {
  console.error(`[${job?.name}] failed:`, err.message);
  if (!job) return;
  const finalAttempt = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!finalAttempt) return;
  const message = `${job.name}: ${err.message}`.slice(0, 500);
  if (job.data.variantId) {
    await prisma.variant.update({ where: { id: job.data.variantId }, data: { status: "FAILED", lastError: message } });
  }
  await prisma.story.update({ where: { id: job.data.storyId }, data: { status: "FAILED", lastError: message } });
});

// Finish the current job before stopping (for safe deploys).
async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("Worker started");
