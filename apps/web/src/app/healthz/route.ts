/**
 * /healthz  = a tiny "are you awake?" page for a free uptime checker (docs/faster-dashboard.md).
 *
 * Free Render servers fall asleep after 15 minutes without visits, and waking up takes
 * about a minute. A checker that opens this address every 10 minutes keeps the
 * dashboard awake, so it opens fast. It also wakes the API behind it.
 * It shows no private data, so it works without logging in (see middleware.ts).
 *
 * It is also the BACKUP TIMER for the night videos: each visit checks whether a 1 AM / 2 AM
 * video is missing and, if so, starts the GitHub run (apps/api/src/backup-timer.ts).
 * Vercel opens it once between 2:45-3:45 AM and once between 4:45-5:45 AM Nepal by itself (apps/web/vercel.json "crons").
 */
import { apiRaw } from "@/lib/api";
import { checkBackupTimer } from "@/lib/backup-timer";

export const dynamic = "force-dynamic"; // never cached: it must really reach the server

export async function GET() {
  const api = await apiRaw("/health").then((r) => r.ok).catch(() => false);
  const timer = api ? await checkBackupTimer() : null;
  return Response.json({ ok: true, api, nightVideos: timer?.started ? "started a missing night video" : "ok" }, { headers: { "cache-control": "no-store" } });
}
