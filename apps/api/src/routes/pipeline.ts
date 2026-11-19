import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import { currentQuotaDayStart } from "@dualflow/ai";
import { queueCounts, nextRunAfter } from "@dualflow/queue";
import { listFiles, storageDriver } from "@dualflow/storage";
import { githubRunConfigured, triggerPipelineRun } from "../github";
import { getDefaultWorkspace } from "../workspace";

/** Free limits shown on the Costs page (change them if Google, Azure or Cloudflare change theirs). */
const FREE = {
  geminiPerDay: () => Number(process.env.GEMINI_DAILY_REQUESTS ?? 20),
  geminiVoicePerDay: () => Number(process.env.GEMINI_TTS_DAILY_REQUESTS ?? 14),
  azureCharsPerMonth: 500_000,
  r2Bytes: 10 * 1024 ** 3, // 10 GB
};

export async function pipelineRoutes(app: FastifyInstance) {
  /** Queue status and how much of each free limit is used. */
  app.get("/pipeline/status", async () => {
    const ws = await getDefaultWorkspace();
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const sumUnits = (provider: { startsWith: string } | string, since: Date) =>
      prisma.costEvent
        .aggregate({ _sum: { units: true }, where: { workspaceId: ws.id, provider, createdAt: { gte: since } } })
        .then((r) => r._sum.units ?? 0);

    const [queue, next, gemini, geminiVoice, azure, edge, files] = await Promise.all([
      queueCounts(),
      nextRunAfter(),
      sumUnits({ startsWith: "gemini:" }, currentQuotaDayStart()), // text requests
      sumUnits("gemini-tts", currentQuotaDayStart()), // voice requests
      sumUnits("azure-tts", startOfMonth),
      sumUnits("edge-tts", startOfMonth),
      listFiles("stories/").catch(() => []), // storage not set up yet: show 0
    ]);

    return {
      queue: { ...queue, nextJobAt: next },
      runNowAvailable: githubRunConfigured(),
      quotas: [
        { name: "Gemini requests today", used: gemini, limit: FREE.geminiPerDay() },
        { name: "Gemini voice requests today", used: geminiVoice, limit: FREE.geminiVoicePerDay() },
        { name: "Azure voice characters this month", used: azure, limit: FREE.azureCharsPerMonth },
        { name: "Edge voice characters this month (no limit)", used: edge, limit: null },
        {
          name: `Storage used (${storageDriver() === "r2" ? "Cloudflare R2" : "this computer"}), MB`,
          used: Math.round(files.reduce((n, f) => n + f.size, 0) / 1e6),
          limit: storageDriver() === "r2" ? Math.round(FREE.r2Bytes / 1e6) : null,
        },
      ],
    };
  });

  /** Start a GitHub Actions run now (free plan). */
  app.post("/pipeline/run-now", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const result = await triggerPipelineRun();
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "pipeline.run_now" } });
    if (!result.started) return reply.code(409).send(result);
    return result;
  });
}
