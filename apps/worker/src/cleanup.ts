/**
 * Cleanup: keeps storage under the free 10 GB of Cloudflare R2.
 * GitHub Actions runs it after each pipeline run (`pnpm --filter @dualflow/worker cleanup`).
 *
 *  1. Deletes files from OLD runs of a story (a retry makes new files in run-2, run-3...).
 *  2. Deletes all files of stories that were PUBLISHED or FAILED more than
 *     RETENTION_DAYS ago (default 30). The story text stays in the database.
 *  3. Deletes finished job rows older than 30 days, so the database stays small (Neon free: 1 GB).
 */
import { prisma } from "@dualflow/db";
import { deleteFile, listFiles } from "@dualflow/storage";

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const retentionDays = Number(process.env.RETENTION_DAYS ?? 30);
  const oldDate = new Date(Date.now() - retentionDays * DAY);
  let deleted = 0;
  let freedBytes = 0;

  const stories = await prisma.story.findMany({ select: { id: true, run: true, status: true, updatedAt: true } });
  const byId = new Map(stories.map((s) => [s.id, s]));

  for (const file of await listFiles("stories/")) {
    // Keys look like: stories/<storyId>/<language>/run-<number>/<file>
    const [, storyId, , runFolder] = file.key.split("/");
    const story = storyId ? byId.get(storyId) : undefined;
    const run = Number(runFolder?.replace("run-", ""));
    const oldRun = story && Number.isFinite(run) && run < story.run;
    const expired = story && ["PUBLISHED", "FAILED"].includes(story.status) && story.updatedAt < oldDate;
    const orphan = !story; // the story was deleted
    if (oldRun || expired || orphan) {
      await deleteFile(file.key);
      deleted++;
      freedBytes += file.size;
    }
  }

  const jobs = await prisma.pipelineJob.deleteMany({
    where: { status: { in: ["DONE", "FAILED"] }, updatedAt: { lt: new Date(Date.now() - 30 * DAY) } },
  });

  console.log(`Cleanup: deleted ${deleted} files (${(freedBytes / 1e6).toFixed(1)} MB) and ${jobs.count} old job rows.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
