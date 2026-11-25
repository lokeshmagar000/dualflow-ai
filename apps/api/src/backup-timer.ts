/**
 * BACKUP TIMER for the night videos.
 *
 * GitHub's own timer (the "schedule" in .github/workflows/pipeline.yml) is not reliable on
 * free accounts: on 2026-11-23 the 2 AM run started 4.5 hours late, and on 2026-11-24 the
 * night runs did not start at all. So the dashboard checks too:
 *
 *   After 1:30 AM Nepal time, if today has no automatic story yet (and after 2:00 AM, fewer
 *   than 2), and no Pipeline run is waiting or running, it starts one itself
 *   ("Run workflow" with auto_slot), the same as GitHub's timer would have.
 *
 * Who calls it: /healthz (your keep-awake checker every few minutes, and Vercel's daily timer,
 * apps/web/vercel.json) and opening any dashboard page. It is cheap when there is nothing to do,
 * and it never adds extra videos: the run itself still checks the daily limit and the Auto switch.
 */
import { prisma } from "@dualflow/db";
import { githubRunConfigured, latestPipelineRuns, triggerPipelineRun } from "./github";

/**
 * Minutes after Nepal midnight when each video of the day is due: 1:30 AM and 2:00 AM
 * (about 25 minutes after GitHub's 1:05 / 1:35 AM times), so both are ready by 3 AM.
 */
export const SLOT_DUE_MINUTES = [1 * 60 + 30, 2 * 60];
/**
 * Do not start another backup run within this many minutes of the last one. A run takes about
 * 15-20 minutes, and while it is waiting or running we never start another anyway.
 */
const COOLDOWN_MINUTES = 20;

/** Midnight of today in the given time zone, as a UTC Date (same as apps/worker/src/auto-ideas.ts). */
export function startOfLocalDay(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offsetMs);
}

/** How many videos should exist by now today (0, 1 or 2), limited by AUTO_STORIES_PER_DAY. */
export function videosDueNow(timeZone: string, perDay: number, now = new Date()): number {
  const minutes = (now.getTime() - startOfLocalDay(timeZone, now).getTime()) / 60_000;
  return Math.min(perDay, SLOT_DUE_MINUTES.filter((m) => minutes >= m).length);
}

export type TickResult = { started: boolean; reason: string };

let lastCheck = 0;

/** Checks if a night video is missing and starts a run for it. Safe to call often. */
export async function backupTick(now = new Date()): Promise<TickResult> {
  // At most one real check every 4 minutes per server.
  if (now.getTime() - lastCheck < 4 * 60_000) return { started: false, reason: "checked a moment ago" };
  lastCheck = now.getTime();

  if (!githubRunConfigured()) return { started: false, reason: "GITHUB_REPO / GITHUB_DISPATCH_TOKEN not set" };
  const perDay = Number(process.env.AUTO_STORIES_PER_DAY ?? 2);
  const timeZone = process.env.AUTO_TIMEZONE || "Asia/Kathmandu";
  const due = videosDueNow(timeZone, perDay, now);
  if (due <= 0) return { started: false, reason: "no video due yet today" };

  const ws = await prisma.workspace.findUnique({ where: { slug: "default" } });
  if (!ws) return { started: false, reason: "no workspace yet" };
  const rule = await prisma.automationRule.findFirst({ where: { workspaceId: ws.id, channelId: null } });
  if (rule && !rule.enabled) return { started: false, reason: "Auto mode is off" };
  if (await prisma.budget.findFirst({ where: { workspaceId: ws.id, paused: true } })) return { started: false, reason: "kill switch on" };

  const today = await prisma.story.count({
    where: { workspaceId: ws.id, topic: { source: { not: "UPLOAD" } }, createdAt: { gte: startOfLocalDay(timeZone, now) } },
  });
  if (today >= due) return { started: false, reason: `today has ${today} of ${due} due` };

  const recent = await prisma.auditLog.findFirst({
    where: { workspaceId: ws.id, action: "auto.backup_start", createdAt: { gte: new Date(now.getTime() - COOLDOWN_MINUTES * 60_000) } },
  });
  if (recent) return { started: false, reason: "a backup run was started less than an hour ago" };

  // A Pipeline run that is waiting or running (maybe GitHub's late timer) will make it: do not start another.
  const runs = await latestPipelineRuns();
  if (runs.some((r) => r.status !== "completed")) return { started: false, reason: "a Pipeline run is already waiting or running" };

  const result = await triggerPipelineRun(undefined, { auto_slot: String(due) });
  if (result.started) {
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "backup-timer", action: "auto.backup_start", target: `video ${today + 1} of ${due} due` } });
  }
  return { started: result.started, reason: result.started ? `started a run for video ${today + 1}` : result.message };
}
