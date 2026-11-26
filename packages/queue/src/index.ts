/**
 * The job queue, stored in Postgres (free plan: no Redis needed).
 *
 * How it works:
 *  - enqueue() adds a row to the PipelineJob table with status QUEUED.
 *  - claimNext() takes the oldest waiting job and marks it RUNNING.
 *    "FOR UPDATE SKIP LOCKED" means two workers never take the same job.
 *  - When the step finishes we call done(); when it breaks we call fail(),
 *    which either schedules a retry (waiting longer each time) or gives up.
 *
 * The same queue works for a worker that runs all day on your computer
 * and for a GitHub Actions run that empties the queue and then stops.
 */
import { prisma, type PipelineJob } from "@dualflow/db";
import type { JobName, PipelineJobData } from "@dualflow/shared";

export type { PipelineJob };

/** If a worker crashes mid-step, the job is given out again after this long. */
const LOCK_MS = 20 * 60 * 1000;
/** Retry waits: 10 s, 20 s, 40 s ... */
const RETRY_BASE_MS = 10_000;

/** A unique key per step, variant and run, so the same job is never added twice. */
export function jobKey(step: JobName, data: PipelineJobData): string {
  return `${step}-${data.variantId ?? data.storyId}-${data.run ?? 1}`;
}

/** Add a job. Adding the same key again does nothing (safe on retries). */
export async function enqueue(step: JobName, data: PipelineJobData, opts: { runAfter?: Date } = {}) {
  const key = jobKey(step, data);
  try {
    await addJob(key, step, data, opts);
  } catch (err) {
    // Two steps finishing at the same moment can both add the same job (e.g. "publish" when the
    // Nepali and English videos are ready together). The job is there: that is all we wanted.
    // (2026-11-26: this error made the English video render a second time.)
    if ((err as { code?: string }).code === "P2002") return;
    throw err;
  }
}

async function addJob(key: string, step: JobName, data: PipelineJobData, opts: { runAfter?: Date }) {
  await prisma.pipelineJob.upsert({
    where: { key },
    update: {}, // already queued: leave it alone
    create: {
      key,
      step,
      storyId: data.storyId,
      variantId: data.variantId ?? null,
      run: data.run ?? 1,
      runAfter: opts.runAfter ?? new Date(),
    },
  });
}

/** Take the next job that is ready, or null when nothing is ready. */
export async function claimNext(): Promise<PipelineJob | null> {
  // 1) Jobs stuck in RUNNING after a crash become QUEUED again.
  await prisma.pipelineJob.updateMany({
    where: { status: "RUNNING", lockedUntil: { lt: new Date() } },
    data: { status: "QUEUED", lockedUntil: null },
  });
  // 2) Take one ready job in a single SQL statement, so it is safe with many workers.
  const rows = await prisma.$queryRaw<PipelineJob[]>`
    UPDATE "PipelineJob"
       SET "status" = 'RUNNING',
           "attempts" = "attempts" + 1,
           "lockedUntil" = ${new Date(Date.now() + LOCK_MS)},
           "updatedAt" = now()
     WHERE "id" = (
       SELECT "id" FROM "PipelineJob"
        WHERE "status" = 'QUEUED' AND "runAfter" <= now()
        ORDER BY "runAfter" ASC, "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING *`;
  return rows[0] ?? null;
}

export async function done(job: PipelineJob) {
  await prisma.pipelineJob.update({
    where: { id: job.id },
    data: { status: "DONE", lockedUntil: null, lastError: null },
  });
}

/**
 * The step failed. Returns true when this was the final attempt
 * (or the error can never be fixed by retrying), so the caller can mark
 * the story as FAILED and show the reason in the dashboard.
 */
export async function fail(job: PipelineJob, error: string, opts: { permanent?: boolean } = {}): Promise<boolean> {
  const final = opts.permanent || job.attempts >= job.maxAttempts;
  await prisma.pipelineJob.update({
    where: { id: job.id },
    data: final
      ? { status: "FAILED", lockedUntil: null, lastError: error.slice(0, 1000) }
      : {
          status: "QUEUED",
          lockedUntil: null,
          lastError: error.slice(0, 1000),
          runAfter: new Date(Date.now() + RETRY_BASE_MS * 2 ** (job.attempts - 1)),
        },
  });
  return final;
}

/**
 * Put the job back to wait until a later time WITHOUT using up an attempt.
 * Used when a free daily quota (like Gemini's) is used up: we try again tomorrow.
 */
export async function postpone(job: PipelineJob, until: Date, reason: string) {
  await prisma.pipelineJob.update({
    where: { id: job.id },
    data: { status: "QUEUED", lockedUntil: null, attempts: { decrement: 1 }, runAfter: until, lastError: reason },
  });
}

/** How many jobs are ready to run now, waiting for later, and running. */
export async function queueCounts() {
  const now = new Date();
  const [readyNow, later, running] = await Promise.all([
    prisma.pipelineJob.count({ where: { status: "QUEUED", runAfter: { lte: now } } }),
    prisma.pipelineJob.count({ where: { status: "QUEUED", runAfter: { gt: now } } }),
    prisma.pipelineJob.count({ where: { status: "RUNNING" } }),
  ]);
  return { readyNow, later, running };
}

/** When the next waiting job becomes ready (null if none is waiting). */
export async function nextRunAfter(): Promise<Date | null> {
  const next = await prisma.pipelineJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { runAfter: "asc" },
    select: { runAfter: true },
  });
  return next?.runAfter ?? null;
}
