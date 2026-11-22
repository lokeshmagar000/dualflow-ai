/**
 * Channels connected with the dashboard's "Connect" buttons, and its "Auto upload" switch.
 *
 * The dashboard saves them (tokens locked) in the database. Here we unlock them and lay them
 * over process.env with the same names the GitHub Secrets use (YOUTUBE_REFRESH_TOKEN_NE, ...),
 * so the rest of the upload code does not need to know where a token came from.
 * Call applyDashboardConnections() once, at the start of a run, before reading any settings.
 */
import { prisma } from "@dualflow/db";
import { connectionsToEnv, lockSecret, secretKeyId, secretKeySource, setRefreshTokenSaver } from "@dualflow/publish";

export async function applyDashboardConnections(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const ws = await prisma.workspace.findUnique({ where: { slug: "default" } });
  if (!ws) return;
  const [settings, channels] = await Promise.all([
    prisma.appSetting.findMany({ where: { workspaceId: ws.id } }),
    prisma.channel.findMany({ where: { workspaceId: ws.id, OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }] } }),
  ]);
  if (settings.length === 0 && channels.length === 0) return;

  const { overlay, problems } = connectionsToEnv(settings, channels);
  Object.assign(process.env, overlay);
  const names = channels.map((c) => `${c.platform.toLowerCase()} ${c.language}`).join(", ");
  console.log(`Dashboard connections: ${names || "none"} (key from ${secretKeySource() ?? "nowhere"}, id ${secretKeyId() ?? "-"}).`);
  if (overlay.PUBLISH_ENABLED) {
    console.log(`Auto upload switch (Channels page): ${overlay.PUBLISH_ENABLED === "false" ? "OFF" : overlay.PUBLISH_DRY_RUN === "true" ? "PRACTICE" : overlay.PUBLISH_MODE}. It replaces the GitHub variables PUBLISH_ENABLED / PUBLISH_DRY_RUN / PUBLISH_MODE.`);
  }
  for (const p of problems) console.log(`::warning::${p}`);

  // TikTok sometimes hands out a new refresh token: save it (locked) so the next run uses it.
  setRefreshTokenSaver(async (_platform, language, token) => {
    await prisma.channel.updateMany({ where: { workspaceId: ws.id, platform: "TIKTOK", language }, data: { refreshTokenEnc: lockSecret(token) } });
  });
}
