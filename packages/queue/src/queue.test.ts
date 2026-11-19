/**
 * Tests for the Postgres job queue. They need a real database, so they run
 * only when DATABASE_URL is set (CI starts a Postgres for them).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@dualflow/db";
import { claimNext, done, enqueue, fail, postpone, queueCounts } from "./index";

const skip = !process.env.DATABASE_URL && "DATABASE_URL not set";
const story = `test-story-${Date.now()}`;

before(async () => {
  if (!skip) await prisma.pipelineJob.deleteMany({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
});
after(async () => {
  if (!skip) await prisma.pipelineJob.deleteMany({ where: { storyId: story } });
  await prisma.$disconnect();
});

test("adding the same job twice keeps one job", { skip }, async () => {
  await enqueue("research", { storyId: story, run: 1 });
  await enqueue("research", { storyId: story, run: 1 });
  assert.equal(await prisma.pipelineJob.count({ where: { storyId: story } }), 1);
});

test("two workers never get the same job", { skip }, async () => {
  const [a, b] = await Promise.all([claimNext(), claimNext()]);
  assert.ok(a || b);
  assert.ok(!(a && b), "only one worker may take the single job");
  const job = (a ?? b)!;
  assert.equal(job.status, "RUNNING");
  assert.equal(job.attempts, 1);
  await done(job);
});

test("a failed job is retried later, then given up after the last attempt", { skip }, async () => {
  await enqueue("voice", { storyId: story, variantId: `${story}-ne`, run: 1 });
  let job = (await claimNext())!;
  assert.equal(await fail(job, "network hiccup"), false); // attempt 1 of 3: retry
  assert.equal((await queueCounts()).later, 1); // waiting 10 seconds
  await prisma.pipelineJob.update({ where: { id: job.id }, data: { runAfter: new Date(), attempts: 2 } });
  job = (await claimNext())!;
  assert.equal(job.attempts, 3);
  assert.equal(await fail(job, "still broken"), true); // last attempt: give up
});

test("a permanent error is not retried; postpone keeps the attempt", { skip }, async () => {
  await enqueue("script", { storyId: story, variantId: `${story}-en`, run: 1 });
  let job = (await claimNext())!;
  await postpone(job, new Date(Date.now() + 60_000), "free limit used");
  const waiting = await prisma.pipelineJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(waiting.attempts, 0);
  assert.equal(waiting.status, "QUEUED");
  await prisma.pipelineJob.update({ where: { id: job.id }, data: { runAfter: new Date() } });
  job = (await claimNext())!;
  assert.equal(await fail(job, "bad key", { permanent: true }), true);
});
