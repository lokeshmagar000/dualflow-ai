/**
 * DualFlow worker: takes jobs from the queue and runs the matching step.
 * You can run many copies of this program to process more videos at once.
 */
import { Worker } from "bullmq";
import { prisma } from "@dualflow/db";
import { QUEUE_NAME, type JobName, type PipelineJobData } from "@dualflow/shared";
import { connection } from "./connection";
import { steps } from "./steps";

const worker = new Worker<PipelineJobData, void, JobName>(
  QUEUE_NAME,
  async (job) => {
    const step = steps[job.name];
    if (!step) throw new Error(`Unknown step: ${job.name}`);
    console.log(`[${job.name}] story=${job.data.storyId} variant=${job.data.variantId ?? "-"}`);
    await step(job.data);
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) },
);

// After all retries fail, mark the variant as FAILED so the dashboard shows it.
worker.on("failed", async (job, err) => {
  console.error(`[${job?.name}] failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1) && job.data.variantId) {
    await prisma.variant.update({ where: { id: job.data.variantId }, data: { status: "FAILED" } });
  }
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
