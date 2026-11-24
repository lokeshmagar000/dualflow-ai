/**
 * Automatic videos, for the card at the top of the Ideas page.
 *
 *   GET  /auto              Auto mode on/off, next run times, AI-picked topics
 *   POST /auto              { enabled: true | false } = the Auto mode switch
 *   POST /auto/generate-now the "Generate now" button: starts a run that makes one video now
 *   POST /auto/tick         backup timer: starts a run when a night video is missing (src/backup-timer.ts)
 *
 * The switch is saved as an AutomationRule without a channel (no new table needed).
 * No rule yet = Auto mode ON (that is how it worked before).
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import { githubRunConfigured, triggerPipelineRun } from "../github";
import { getDefaultWorkspace } from "../workspace";
import { backupTick } from "../backup-timer";

/** The scheduled times in .github/workflows/pipeline.yml, in UTC: 20:15 and 22:15 (= 2:00 and 4:00 AM Nepal). */
export const SCHEDULE_UTC = [
  { hour: 20, minute: 15 },
  { hour: 22, minute: 15 },
];

/** The next `count` scheduled run times after `now`. */
export function nextRuns(now = new Date(), count = 2): Date[] {
  const found: Date[] = [];
  for (let day = 0; found.length < count && day < 3; day++) {
    for (const t of SCHEDULE_UTC) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, t.hour, t.minute));
      if (d > now && found.length < count) found.push(d);
    }
  }
  return found;
}

async function autoRule(workspaceId: string) {
  return prisma.automationRule.findFirst({ where: { workspaceId, channelId: null } });
}

export async function autoRoutes(app: FastifyInstance) {
  app.get("/auto", async () => {
    const ws = await getDefaultWorkspace();
    const [rule, paused, aiTopics, waitingIdeas] = await Promise.all([
      autoRule(ws.id),
      prisma.budget.findFirst({ where: { workspaceId: ws.id, paused: true } }),
      prisma.topic.findMany({
        where: { workspaceId: ws.id, source: "DIRECTOR" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, createdAt: true, stories: { select: { id: true, status: true }, take: 1, orderBy: { createdAt: "desc" } } },
      }),
      prisma.topic.count({ where: { workspaceId: ws.id, status: { in: ["NEW", "ACCEPTED"] }, source: { notIn: ["UPLOAD", "DIRECTOR"] } } }),
    ]);
    return {
      enabled: rule ? rule.enabled : true,
      paused: Boolean(paused), // the kill switch on the Costs page stops everything
      perDay: Number(process.env.AUTO_STORIES_PER_DAY ?? 2),
      nextRuns: nextRuns().map((d) => d.toISOString()),
      generateNowAvailable: githubRunConfigured(),
      waitingIdeas, // your own ideas not made yet: the next runs use these first
      aiTopics: aiTopics.map(({ stories, ...t }) => ({ ...t, storyId: stories[0]?.id ?? null, storyStatus: stories[0]?.status ?? null })),
    };
  });

  app.post<{ Body: { enabled?: boolean } }>("/auto", async (req) => {
    const ws = await getDefaultWorkspace();
    const enabled = req.body?.enabled !== false;
    const rule = await autoRule(ws.id);
    if (rule) await prisma.automationRule.update({ where: { id: rule.id }, data: { enabled } });
    else await prisma.automationRule.create({ data: { workspaceId: ws.id, cron: "15 20,22 * * *", dailyLimit: 2, enabled } });
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: enabled ? "auto.on" : "auto.off" } });
    return { enabled };
  });

  // Called by /healthz and by opening dashboard pages. Never fails the caller.
  app.post("/auto/tick", async (req) => {
    try {
      const r = await backupTick();
      if (r.started) req.log.info(`Backup timer: ${r.reason}`);
      return r;
    } catch (err) {
      req.log.warn(`Backup timer: ${(err as Error).message}`);
      return { started: false, reason: (err as Error).message };
    }
  });

  app.post("/auto/generate-now", async (_req, reply) => {
    const ws = await getDefaultWorkspace();
    if (await prisma.budget.findFirst({ where: { workspaceId: ws.id, paused: true } })) {
      return reply.code(409).send({ started: false, message: "Automation is paused (kill switch on Costs & limits). Turn it back on first." });
    }
    const result = await triggerPipelineRun(undefined, { auto_now: "true" });
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "auto.generate_now" } });
    if (!result.started) return reply.code(409).send(result);
    return { ...result, message: "Started! The AI picks a topic and makes the Nepali + English videos. They appear on Ready to upload in about 15-20 minutes." };
  });
}
