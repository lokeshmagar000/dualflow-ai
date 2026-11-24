/**
 * Asks the API's backup timer (POST /auto/tick, apps/api/src/backup-timer.ts) whether a night
 * video is missing, and lets it start a GitHub run if so.
 * Fire and forget: it never slows down or breaks the page that calls it.
 */
import { api } from "@/lib/api";

let last = 0;

export function pokeBackupTimer(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return; // not while building the site
  const now = Date.now();
  if (now - last < 4 * 60_000) return; // at most every 4 minutes from this server
  last = now;
  api<{ started: boolean; reason: string }>("/auto/tick", { method: "POST", body: "{}" }).catch(() => {});
}

/** Same, but waits for the answer (for /healthz, so Vercel's timer does not stop it half way). */
export async function checkBackupTimer(): Promise<{ started: boolean; reason: string } | null> {
  last = Date.now();
  return api<{ started: boolean; reason: string }>("/auto/tick", { method: "POST", body: "{}" }).catch(() => null);
}
