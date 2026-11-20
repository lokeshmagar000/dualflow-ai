/**
 * Upload run (GitHub Actions runs it after making the videos):
 *   pnpm --filter @dualflow/worker upload
 *
 * Does nothing unless PUBLISH_ENABLED=true. With PUBLISH_DRY_RUN=true (the default)
 * it only checks your channels and prints what it WOULD upload.
 */
import { prisma } from "@dualflow/db";
import { configuredChannels, dryRun, missingSettings, publishEnabled, chosenPlatforms, LANGS } from "@dualflow/publish";
import { assignSlots, planRecentStories, syncChannels, uploadDue } from "./publishing";

async function main() {
  if (!publishEnabled()) {
    console.log("Publishing is off (set the GitHub variable PUBLISH_ENABLED=true to turn it on).");
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
