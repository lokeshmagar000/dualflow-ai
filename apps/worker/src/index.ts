/**
 * DualFlow worker: takes jobs from the queue (a Postgres table) and runs the matching step.
 *
 * Two ways to run it (WORKER_MODE):
 *   "forever" (default) keeps running and checks for new jobs every few seconds.
 *             Use this on your own computer with `pnpm dev`.
 *   "once"    does every job that is ready, then stops. GitHub Actions uses this
 *             on the free plan: no server has to run all day.
 *
 * WORKER_CONCURRENCY = how many steps run at the same time (default 2:
 * the Nepali and English versions side by side).
 * WORKER_MAX_MINUTES = in "once" mode, stop taking new jobs after this long
 * (default 45), so a GitHub Actions run never hits its time limit.
 */
import { prisma, type PipelineJob } from "@dualflow/db";
import { AIQuotaError, aiProvider, claudeCheckPictures, claudeKeySet, isPermanentError } from "@dualflow/ai";
import { setPictureChecker } from "@dualflow/video";
import { applyDashboardAiChoice } from "./ai-choice";
import { VoiceConfigError } from "@dualflow/voice";
import { claimNext, done, fail, nextRunAfter, postpone, queueCounts } from "@dualflow/queue";
import type { JobName } from "@dualflow/shared";
import { steps } from "./steps";
import { StopError } from "./errors";

const once = (process.env.WORKER_MODE ?? "forever").toLowerCase() === "once";
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
const deadline = Date.now() + Number(process.env.WORKER_MAX_MINUTES ?? 45) * 60_000;
/** In "once" mode, wait for a retry only if it is due within this time. */
const WAIT_FOR_RETRY_MS = 3 * 60_000;
const POLL_MS = 2_000;

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one job and record what happened. */
async function runJob(job: PipelineJob) {
  const step = steps[job.step as JobName];
  const label = `[${job.step}] story=${job.storyId} variant=${job.variantId ?? "-"} attempt=${job.attempts}`;
  console.log(label);
  try {
    if (!step) throw new StopError(`Unknown step: ${job.step}`);
    await step({ storyId: job.storyId, variantId: job.variantId ?? undefined, run: job.run });
    await done(job);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    // A free daily limit is used up: wait for it to reset, this is not a failure.
    if (err instanceof AIQuotaError) {
      console.log(`${label} waiting until ${err.retryAt.toISOString()}: ${message}`);
      await postpone(job, err.retryAt, message);
      return;
    }
    // Errors that retrying cannot fix (bad key, bad request, kill switch): stop now.
    const permanent = isPermanentError(err) || err instanceof VoiceConfigError || err instanceof StopError;
    console.error(`${label} failed${permanent ? " (will not retry)" : ""}: ${message}`);
    const final = await fail(job, message, { permanent });
    // After the last try, mark the story FAILED and save the reason for the dashboard.
    if (final) {
      const reason = `${job.step}: ${message}`.slice(0, 500);
      if (job.variantId) {
        await prisma.variant.update({ where: { id: job.variantId }, data: { status: "FAILED", lastError: reason } });
      }
      await prisma.story.update({ where: { id: job.storyId }, data: { status: "FAILED", lastError: reason } });
    }
  }
}

/** True when a "once" run has nothing left to do now. */
async function finishedForNow(): Promise<boolean> {
  const { readyNow, running } = await queueCounts();
  if (readyNow > 0 || running > 0) return false;
  const next = await nextRunAfter();
  // Nothing waiting, or the next job is far away (like tomorrow's quota): stop.
  return !next || next.getTime() - Date.now() > WAIT_FOR_RETRY_MS;
}

/** One "lane" takes jobs one after another. We run `concurrency` lanes side by side. */
async function lane() {
  while (!stopping) {
    if (once && Date.now() > deadline) return; // leave the rest for the next run
    const job = await claimNext();
    if (job) {
      await runJob(job);
      continue;
    }
    if (once && (await finishedForNow())) return;
    await sleep(POLL_MS);
  }
}

async function main() {
  await applyDashboardAiChoice(); // Claude or Gemini, chosen on the dashboard's Settings page
  // Picture check: Claude first when Claude is chosen; otherwise Claude is only the backup when Gemini fails.
  if (aiProvider() !== "mock" && claudeKeySet()) setPictureChecker(claudeCheckPictures, aiProvider() === "claude");
  console.log(`Worker started (mode: ${once ? "once" : "forever"}, ${concurrency} at a time)`);
  await Promise.all(Array.from({ length: concurrency }, () => lane()));
  const left = await queueCounts();
  console.log(`Worker finished. Waiting jobs: ${left.readyNow + left.later}`);
  await prisma.$disconnect();
}

// Finish the current job before stopping (for safe deploys).
function shutdown() {
  stopping = true;
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
