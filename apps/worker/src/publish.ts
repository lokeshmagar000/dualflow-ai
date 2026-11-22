/**
 * Upload run (GitHub Actions runs it after making the videos):
 *   pnpm --filter @dualflow/worker upload
 *
 * Does nothing unless publishing is on (the Auto upload switch on the Channels page, or
 * PUBLISH_ENABLED=true). In practice mode it only prints what it WOULD upload.
 */
import { prisma } from "@dualflow/db";
import { configuredChannels, dryRun, missingSettings, publishEnabled, chosenPlatforms, LANGS } from "@dualflow/publish";
import { assignSlots, planRecentStories, syncChannels, uploadDue } from "./publishing";
import { applyDashboardConnections } from "./dashboard-connections";

async function main() {
  await applyDashboardConnections(); // channels connected on the dashboard + its Auto upload switch
  if (!publishEnabled()) {
    console.log("Publishing is off (turn on Auto upload on the dashboard's Channels page, or set the GitHub variable PUBLISH_ENABLED=true).");
    // Leave a note on uploads that are waiting (e.g. from the bulk upload page), so you can see why.
    const noted = await prisma.publication.updateMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
      data: { error: "Publishing is off: turn on Auto upload on the Channels page, then press Upload now on the Bulk upload page." },
    });
    if (noted.count) console.log(`Left a note on ${noted.count} waiting upload(s).`);
    return;
  }
  const channels = configuredChannels();
  console.log(`Publishing is ON${dryRun() ? " in PRACTICE mode (PUBLISH_DRY_RUN=true): nothing will be uploaded" : ""}.`);
  console.log(`Channels with all settings: ${channels.map((c) => `${c.label} [${c.mode}]`).join(", ") || "none"}`);
  for (const p of chosenPlatforms()) {
    for (const l of LANGS) {
      const missing = missingSettings(p, l);
      if (missing.length && missing.length < 3) console.log(`  ${p} ${l}: missing ${missing.join(", ")}`);
    }
  }
  if (channels.length === 0) return;

  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  for (const ws of workspaces) {
    await syncChannels(ws.id);
    if (!dryRun()) {
      await planRecentStories(ws.id);
      await assignSlots(ws.id);
    }
    const r = await uploadDue(ws.id);
    console.log(`Upload run finished: ${r.uploaded} uploaded, ${r.waiting} will retry later, ${r.failed} failed${r.practice ? `, ${r.practice} practice` : ""}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
