/**
 * Cleanup: keeps storage under the free 10 GB of Cloudflare R2.
 * GitHub Actions runs it after each pipeline run (`pnpm --filter @dualflow/worker cleanup`).
 *
 *  1. Deletes files from OLD runs of a story (a retry makes new files in run-2, run-3...).
 *  2. Deletes all files of a story as soon as its video is uploaded everywhere
 *     (status PUBLISHED and every upload succeeded). Turn off with DELETE_AFTER_PUBLISH=false
 *     to keep them for RETENTION_DAYS instead. The story text stays in the database.
 *  3. Deletes all files of stories that FAILED (or were PUBLISHED) more than
 *     RETENTION_DAYS ago (default 30).
 *  4. Bulk upload videos (uploads/...): deleted once every ticked channel has them, after
 *     RETENTION_DAYS in any case, and after 1 day if no upload uses them (the sending was stopped).
 *  5. Deletes finished job rows older than 30 days, so the database stays small (Neon free: 1 GB).
 */
import { prisma } from "@dualflow/db";
import { deleteFile, listFiles } from "@dualflow/storage";

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const retentionDays = Number(process.env.RETENTION_DAYS ?? 30);
  const oldDate = new Date(Date.now() - retentionDays * DAY);
  let deleted = 0;
  let freedBytes = 0;

  const deleteAfterPublish = (process.env.DELETE_AFTER_PUBLISH ?? "true").toLowerCase() !== "false";
  const stories = await prisma.story.findMany({
    select: {
      id: true,
      run: true,
      createdAt: true,
      status: true,
      updatedAt: true,
      variants: { select: { outputKey: true, publications: { select: { status: true } } } },
    },
  });
  const byId = new Map(stories.map((s) => [s.id, s]));
  /** Uploaded everywhere: PUBLISHED, has uploads, and none of them failed or is still waiting. */
  const uploadedEverywhere = (s: (typeof stories)[number]) => {
    const pubs = s.variants.flatMap((v) => v.publications);
    return s.status === "PUBLISHED" && pubs.length > 0 && pubs.every((p) => p.status === "PUBLISHED");
  };

  for (const file of await listFiles("stories/")) {
    // Keys look like: stories/<storyId>/<language>/run-<number>/<file>
    const [, storyId, , runFolder] = file.key.split("/");
    const story = storyId ? byId.get(storyId) : undefined;
    const run = Number(runFolder?.replace("run-", ""));
    const oldRun = story && Number.isFinite(run) && run < story.run;
    const expired = story && ["PUBLISHED", "FAILED"].includes(story.status) && story.updatedAt < oldDate;
    const orphan = !story; // the story was deleted
    const uploaded = story && deleteAfterPublish && uploadedEverywhere(story);
    if (oldRun || expired || orphan || uploaded) {
      await deleteFile(file.key);
      deleted++;
      freedBytes += file.size;
    }
  }

  // Videos sent with the bulk upload page. Keys look like: uploads/<random>/video.mp4
  const storyByVideo = new Map(stories.flatMap((s) => s.variants.filter((v) => v.outputKey).map((v) => [v.outputKey!, s] as const)));
  for (const file of await listFiles("uploads/")) {
    const story = storyByVideo.get(file.key);
    const abandoned = !story && file.modified < new Date(Date.now() - DAY);
    const expired = story && story.createdAt < oldDate;
    const uploaded = story && deleteAfterPublish && uploadedEverywhere(story);
    if (abandoned || expired || uploaded) {
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
