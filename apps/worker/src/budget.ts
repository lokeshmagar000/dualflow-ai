/**
 * Money and quota safety.
 *
 * Before any AI or voice step we check:
 *  1. the kill switch (pause button on the Costs page),
 *  2. the daily money budget (for paid providers),
 *  3. the FREE limits, so the free plan never goes over and never gets blocked:
 *     - Gemini requests per day   (GEMINI_DAILY_REQUESTS, default 20)
 *     - Azure free characters     (stop at 90% of 500,000 a month)
 * Every call also writes a CostEvent row, so spend and free use are always known.
 */
import { prisma } from "@dualflow/db";
import { AIQuotaError, aiProvider, currentQuotaDayStart, nextQuotaReset, type CostLine } from "@dualflow/ai";
import { StopError } from "./errors";

export const AZURE_FREE_CHARS = 500_000;

export function geminiDailyLimit(): number {
  return Number(process.env.GEMINI_DAILY_REQUESTS ?? 20);
}

export async function assertBudget(workspaceId: string) {
  const budgets = await prisma.budget.findMany({ where: { workspaceId } });
  if (budgets.some((b) => b.paused)) {
    throw new StopError("Automation is paused (kill switch is on).");
  }
  const daily = budgets.find((b) => b.period === "DAILY");
  if (daily) {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const spent = await prisma.costEvent.aggregate({
      _sum: { usd: true },
      where: { workspaceId, createdAt: { gte: startOfDay } },
    });
    if ((spent._sum.usd ?? 0) >= daily.capUsd) {
      throw new StopError(`Daily budget of $${daily.capUsd} reached.`);
    }
  }
}

/**
 * Free Gemini limit: if today's requests are used up, the job waits until
 * tomorrow (it is not marked as failed). `needed` = requests this step will make.
 */
export async function assertGeminiQuota(workspaceId: string, needed: number) {
  if (aiProvider() !== "gemini") return;
  const used = await prisma.costEvent.aggregate({
    _sum: { units: true },
    where: { workspaceId, provider: { startsWith: "gemini" }, createdAt: { gte: currentQuotaDayStart() } },
  });
  if ((used._sum.units ?? 0) + needed > geminiDailyLimit()) {
    throw new AIQuotaError(
      `Free Gemini limit for today (${geminiDailyLimit()} requests) is used up. Continuing after it resets.`,
      nextQuotaReset(),
    );
  }
}

/** Azure free tier: stop at 90% of the monthly free characters, so we never pay. */
export async function assertAzureFreeQuota(workspaceId: string, characters: number) {
  if ((process.env.AZURE_SPEECH_TIER ?? "F0").toUpperCase() !== "F0") return;
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const used = await prisma.costEvent.aggregate({
    _sum: { units: true },
    where: { workspaceId, provider: "azure-tts", createdAt: { gte: startOfMonth } },
  });
  if ((used._sum.units ?? 0) + characters > AZURE_FREE_CHARS * 0.9) {
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 5));
    throw new AIQuotaError(
      "Azure free voice characters for this month are 90% used. Waiting for next month (or set VOICE_PROVIDER=edge).",
      nextMonth,
    );
  }
}

export async function recordCosts(workspaceId: string, storyId: string, lines: CostLine[]) {
  if (lines.length === 0) return;
  await prisma.costEvent.createMany({
    data: lines.map((l) => ({ workspaceId, storyId, ...l })),
  });
}
