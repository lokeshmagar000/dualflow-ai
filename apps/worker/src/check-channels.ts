/**
 * "Test my channels": checks every channel's settings and token, and prints the
 * account name it belongs to. Uploads nothing. Tokens are never printed.
 * It also saves the channel names (not tokens) so the dashboard Channels page shows them.
 *   pnpm --filter @dualflow/worker check-channels
 */
import { prisma } from "@dualflow/db";
import { chosenPlatforms, getUploader, LANGS, missingSettings, modeFor, platformLabel } from "@dualflow/publish";
import { syncChannels } from "./publishing";
import { applyDashboardConnections } from "./dashboard-connections";

async function main() {
  await applyDashboardConnections(); // channels connected with the dashboard's Connect buttons
  let ok = 0;
  let problems = 0;
  for (const platform of chosenPlatforms()) {
    for (const lang of LANGS) {
      const name = `${platformLabel(platform)} ${lang === "ne" ? "Nepali" : "English"}`;
      const missing = missingSettings(platform, lang);
      if (missing.length) {
        console.log(`-  ${name}: not set up (missing ${missing.join(", ")})`);
        continue;
      }
      const res = await getUploader(platform, lang).check();
      if (res.ok) ok++;
      else problems++;
      console.log(`${res.ok ? "OK" : "!!"} ${name} [mode: ${modeFor(platform)}]: ${res.message}`);
      if (!res.ok) console.log(`::error::${name}: ${res.message}`);
    }
  }
  console.log(`\n${ok} channel(s) working, ${problems} with problems.`);
  // Show the channels in the dashboard (names and modes only, never tokens).
  if (process.env.DATABASE_URL) {
    const ws = await prisma.workspace.upsert({ where: { slug: "default" }, update: {}, create: { slug: "default", name: "DualFlow" } });
    const rows = await syncChannels(ws.id);
    console.log(`Saved ${rows.length} channel(s) for the dashboard.`);
    await prisma.$disconnect();
  }
  if (problems) process.exitCode = 1;
}

main();
